import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const base = 'https://www.douban.com/doulist/7654321/';
const item = (id, rating, year, title = '怪形前传 The Thing', book = false) => `<div class="doulist-item" id="m${id}"><div class="title"><a href="https://${book ? 'book' : 'movie'}.douban.com/subject/${id}/">${title}</a></div><span class="rating_nums">${rating ?? ''}</span><div class="abstract">年份: ${year ?? '未知'}</div></div>`;
const page = (body, next, total = 1) => `<html><head><title>测试片单</title></head><body><div id="content"><div class="article">${body}<div class="paginator"><span data-total-page="${total}"></span>${next ? `<span class="next"><a href="?start=${next}">后页</a></span>` : ''}</div></div></div></body></html>`;
async function boot(t, html = page(item(1, 8, 2000)), { fetcher, fastTimeout } = {}) {
    const dom = new JSDOM(html, { url: base, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const win = dom.window, tabs = [], requests = [], storage = [];
    win.GM_openInTab = url => tabs.push(url);
    for (const key of ['GM_getValue', 'GM_setValue', 'GM_listValues', 'GM_deleteValue']) win[key] = (...args) => { storage.push([key, ...args]); return args[1]; };
    const timeout = win.setTimeout.bind(win);
    win.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 600 ? 1 : ms === 20000 && fastTimeout ? 5 : ms, ...args);
    win.fetch = async (u, opts) => { requests.push(Number(new URL(u).searchParams.get('start'))); return fetcher(u, opts, requests.length); };
    win.eval(source); await new Promise(r => setTimeout(r, 35));
    return { win, doc: win.document, Z: win.__ZCW__, tabs, requests, storage };
}
const visible = doc => [...doc.querySelectorAll('.article > .doulist-item')].filter(n => !n.hidden).map(n => n.id);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settled(doc) {
    for (let i = 0; i < 180; i++) { if (doc.querySelector('#zcw-doulist-sort').getAttribute('aria-busy') === 'false') return; await wait(10); }
    assert.fail('加载没有结束');
}
function filter(doc, rating = '', from = '', to = '') {
    for (const [name, value] of Object.entries({ ratingMin: rating, yearFrom: from, yearTo: to })) {
        const input = doc.querySelector(`#zcw-doulist-sort [name=${name}]`);
        assert.ok(input, '应提供评分/年份筛选'); input.value = String(value);
    }
    doc.querySelector('.zcw-filter-apply').click();
}
function sort(doc, mode) {
    const select = doc.querySelector('#zcw-doulist-sort select'); select.value = mode;
    select.dispatchEvent(new doc.defaultView.Event('change'));
}

test('三入口均有真实链接，Ctrl/Meta/Shift/中键不拦截且不重复开页', async t => {
    const { doc, win, tabs, storage } = await boot(t);
    for (const selector of ['.zcw-search-btn', '.zcw-bilibili-btn', '.zcw-soquark-btn']) {
        const link = doc.querySelector(selector); assert.equal(link.tagName, 'A');
        assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/);
        assert.match(link.href, /^https:/);
        for (const opts of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const e = new win.MouseEvent('click', { bubbles: true, cancelable: true, ...opts });
            link.dispatchEvent(e); assert.equal(e.defaultPrevented, false);
        }
    }
    assert.equal(tabs.length, 0); assert.deepEqual(storage, []);
});

test('修饰键和中键保持原生跳转，同时隔离外层行点击处理', async t => {
    const { doc, win, tabs } = await boot(t);
    const group = doc.querySelector('.zcw-group');
    group.addEventListener('click', e => e.preventDefault());
    group.addEventListener('auxclick', e => e.preventDefault());
    for (const link of group.querySelectorAll('a')) {
        const modified = new win.MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
        link.dispatchEvent(modified); assert.equal(modified.defaultPrevented, false);
        const middle = new win.MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
        link.dispatchEvent(middle); assert.equal(middle.defaultPrevented, false);
    }
    assert.equal(tabs.length, 0);
});

function menu(doc, action) {
    if (!doc.querySelector('.zcw-more-menu')) doc.querySelector('.zcw-more-toggle').click();
    const button = doc.querySelector(`[data-zcw-action="${action}"]`);
    assert.ok(button, action); return button;
}
test('关键词界面全部删除，更多菜单Escape关闭恢复焦点，外部点击关闭', async t => {
    const { doc, win } = await boot(t);
    assert.equal(doc.querySelector('[class*="zcw-keyword"]'), null);
    const toggle = doc.querySelector('.zcw-more-toggle'); assert.ok(toggle); toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.doesNotMatch(doc.querySelector('.zcw-more-menu').textContent, /关键词|中文名|英文名/);
    doc.querySelector('.zcw-more-menu').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.zcw-more-menu'), null); assert.equal(doc.activeElement, toggle);
    toggle.click(); doc.body.click(); assert.equal(doc.querySelector('.zcw-more-menu'), null);
});
test('三站一起搜恰好开三页，预告解说使用B站', async t => {
    const { doc, tabs, storage } = await boot(t);
    const expected = [...doc.querySelectorAll('.zcw-group > a')].map(a => a.href);
    menu(doc, 'all').click(); assert.deepEqual(tabs, expected);
    menu(doc, 'trailer').click(); menu(doc, 'explain').click();
    assert.equal(new URL(tabs[3]).searchParams.get('keyword'), '怪形前传 预告片');
    assert.equal(new URL(tabs[4]).searchParams.get('keyword'), '怪形前传 解说');
    assert.deepEqual(storage, []);
});
test('复制中文优先片名，拒绝剪贴板时可见失败并清除临时节点', async t => {
    const { doc, win } = await boot(t); const copied = [];
    Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) }, configurable: true });
    menu(doc, 'copy').click(); await wait(0); assert.deepEqual(copied, ['怪形前传']);
    Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } } });
    doc.execCommand = () => false;
    menu(doc, 'copy').click(); await wait(0);
    assert.match(doc.querySelector('.zcw-more-status').textContent, /失败/);
    assert.equal(doc.querySelector('textarea'), null);
});
test('年份季数可组合和恢复，不累积，三站同步', async t => {
    const { doc } = await boot(t, page(item(1, 8, 2020, '暗黑 第三季 Dark Season 3')));
    const current = () => new URL(doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword');
    assert.equal(current(), '暗黑 第三季');
    menu(doc, 'year').click(); assert.equal(current(), '暗黑 第三季 2020');
    menu(doc, 'season').click(); assert.equal(current(), '暗黑 2020');
    menu(doc, 'year').click(); assert.equal(current(), '暗黑');
    menu(doc, 'season').click(); assert.equal(current(), '暗黑 第三季');
    menu(doc, 'year').click();
    assert.match(decodeURIComponent(doc.querySelector('.zcw-soquark-btn').href), /暗黑 第三季 2020/);
    assert.match(decodeURIComponent(doc.querySelector('.zcw-search-btn').href), /暗黑 第三季 2020/);
});
test('无年份季数禁用开关，不提取评论年份；英文季数可切换', async t => {
    const { doc } = await boot(t, page(item(1, 8, null, 'Spider-Man') + '<div>评论：2023年看过</div>'));
    assert.equal(menu(doc, 'year').disabled, true); assert.equal(menu(doc, 'season').disabled, true);
    const b = await boot(t, page(item(1, 8, 2020, 'Dark Season 3')));
    menu(b.doc, 'season').click();
    assert.equal(new URL(b.doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword'), 'Dark');
    menu(b.doc, 'season').click();
    assert.equal(new URL(b.doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword'), 'Dark Season 3');
});

test('列表简介首个上映日期也能提取年份，不使用收藏日期', async t => {
    const html = page(item(1, 8, null, '头号玩家')).replace('<div class="abstract">年份: 未知</div>', '<div class="intro">2018-03-11(电影节) / 2018-03-30(中国大陆) / 演员</div><span class="date">2024-01-01</span>');
    const { doc } = await boot(t, html);
    assert.equal(menu(doc, 'year').disabled, false); menu(doc, 'year').click();
    assert.equal(new URL(doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword'), '头号玩家 2018');
});
test('Space重复keydown不重复开页', async t => {
    const { doc, win, tabs } = await boot(t);
    const link = doc.querySelector('.zcw-soquark-btn');
    link.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    link.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }));
    assert.equal(tabs.length, 1);
});

test('评分和年份同时筛选，缺失值排除，清空恢复所有条目并保留排序', async t => {
    const html = page(item(1, 8.5, 2000) + item(2, 9, 1990) + item(3, 7.5, 2010) + item(4, null, 2005) + item(5, 9, null) + item(90, 10, 2000, '书籍', true));
    const { doc, storage } = await boot(t, html);
    filter(doc, 8, 1995, 2005); await settled(doc);
    assert.deepEqual(visible(doc), ['m1']);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /显示.*1/);
    filter(doc, 8); await settled(doc); assert.deepEqual(visible(doc), ['m1', 'm2', 'm5']);
    filter(doc, '', 1990, 2005); await settled(doc); assert.deepEqual(visible(doc), ['m1', 'm2', 'm4']);
    sort(doc, 'year-asc'); await settled(doc); assert.deepEqual(visible(doc), ['m2', 'm1', 'm4']);
    doc.querySelector('.zcw-filter-clear').click(); await settled(doc);
    assert.equal(visible(doc).length, 6);
    assert.equal(doc.querySelector('#zcw-doulist-sort select').value, 'year-asc');
    assert.deepEqual(storage, []);
});

test('非法评分或倒置年份不请求页面、不改变列表', async t => {
    const { doc, requests } = await boot(t, page(item(1, 8, 2000), 25, 2));
    filter(doc, 11); await settled(doc);
    assert.deepEqual(requests, []); assert.deepEqual(visible(doc), ['m1']);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /评分.*0.*10/);
    filter(doc, '', 2020, 1990); await settled(doc);
    assert.deepEqual(requests, []); assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /年份/);
});

test('首次筛选读取全部分页，加载完成后才显示筛选结果', async t => {
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), 25, 3), {
        fetcher: async u => ({ ok: true, url: u, text: async () => Number(new URL(u).searchParams.get('start')) === 25 ? page(item(2, 8, 2000), 50, 3) : page(item(3, 9, 2010), null, 3) }),
    });
    filter(doc, 8, 2005); await settled(doc);
    assert.deepEqual(requests, [25, 50]); assert.deepEqual(visible(doc), ['m3']);
});

test('第三页失败后继续，只重试失败页，不丢前两页、不提交部分结果', async t => {
    let failing = true;
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), 25, 3), {
        fetcher: async u => {
            const n = Number(new URL(u).searchParams.get('start'));
            return { ok: n !== 50 || !failing, status: 503, url: u, text: async () => n === 25 ? page(item(2, 8, 1990), 50, 3) : page(item(3, 9, 2010), null, 3) };
        },
    });
    sort(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(requests, [25, 50]); assert.deepEqual(visible(doc), ['m1']);
    const resume = doc.querySelector('.zcw-load-resume'); assert.ok(resume); assert.equal(resume.hidden, false);
    failing = false; resume.click(); await settled(doc);
    assert.deepEqual(requests, [25, 50, 50]); assert.deepEqual(visible(doc), ['m3', 'm2', 'm1']);
});

test('取消后可以续载，已完成的分页不重复请求', async t => {
    let pendingSignal;
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), 25, 3), {
        fetcher: async (u, opts, n) => {
            if (n === 2) return new Promise((resolve, reject) => { pendingSignal = opts.signal; opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
            const offset = Number(new URL(u).searchParams.get('start'));
            return { ok: true, url: u, text: async () => offset === 25 ? page(item(2, 8, 1990), 50, 3) : page(item(3, 9, 2010), null, 3) };
        },
    });
    sort(doc, 'year-asc');
    for (let i = 0; !pendingSignal && i < 100; i++) await wait(5);
    assert.ok(pendingSignal);
    doc.querySelector('.zcw-load-cancel').click(); await settled(doc);
    assert.deepEqual(visible(doc), ['m1']);
    doc.querySelector('.zcw-load-resume').click(); await settled(doc);
    assert.deepEqual(requests, [25, 50, 50]); assert.deepEqual(visible(doc), ['m2', 'm1', 'm3']);
});

test('续载期间原列表增删时不覆盖变更，提示刷新', async t => {
    const { doc } = await boot(t, page(item(1, 5, 2000), 25, 2), { fetcher: async () => ({ ok: false, status: 503 }) });
    sort(doc, 'rating-desc'); await settled(doc);
    doc.querySelector('.paginator').insertAdjacentHTML('beforebegin', item(8, 9, 2020));
    doc.querySelector('.zcw-load-resume').click(); await settled(doc);
    assert.deepEqual(visible(doc), ['m1', 'm8']);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /变化.*刷新/);
});

test('超时后继续使用新AbortController重试失败页', async t => {
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), 25, 2), {
        fastTimeout: true,
        fetcher: async (u, opts, n) => {
            if (n === 1) return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
            assert.equal(opts.signal.aborted, false);
            return { ok: true, url: u, text: async () => page(item(2, 9, 2020), null, 2) };
        },
    });
    sort(doc, 'rating-desc'); await settled(doc);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /超时/);
    doc.querySelector('.zcw-load-resume').click(); await settled(doc);
    assert.deepEqual(requests, [25, 25]); assert.deepEqual(visible(doc), ['m2', 'm1']);
});

test('筛选无结果后可清空恢复，显式隐藏标记同步移除', async t => {
    const { doc } = await boot(t, page(item(1, 7, 2000)));
    filter(doc, 9); await settled(doc);
    assert.deepEqual(visible(doc), []);
    assert.ok(doc.querySelector('#m1').hasAttribute('data-zcw-filter-hidden'));
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /显示 0/);
    doc.querySelector('.zcw-filter-clear').click(); await settled(doc);
    assert.deepEqual(visible(doc), ['m1']);
    assert.equal(doc.querySelector('#m1').hasAttribute('data-zcw-filter-hidden'), false);
});

test('声明稳定GitHub更新地址且不新增存储权限', () => {
    assert.match(source, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/kakaSheepA\/douban-search-tools\/main\/douban-wish-to-zhongchuang\.user\.js/);
    assert.match(source, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/kakaSheepA\/douban-search-tools\/main\/douban-wish-to-zhongchuang\.user\.js/);
    assert.doesNotMatch(source.split('// ==/UserScript==')[0], /@grant\s+GM_(?:getValue|setValue)/);
});
