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

test('英文切换和手动关键词同步三个href，中键复制使用新词，取消/Escape不应用', async t => {
    const { doc, tabs, storage, win } = await boot(t);
    const edit = doc.querySelector('.zcw-keyword-edit'); assert.ok(edit, '应有关键词编辑入口'); edit.click();
    const editor = doc.querySelector('.zcw-keyword-editor'); assert.ok(editor);
    editor.querySelector('[data-language=english]').click();
    const input = editor.querySelector('input'); assert.equal(input.value, 'The Thing');
    editor.querySelector('.zcw-keyword-apply').click();
    assert.equal(doc.querySelector('.zcw-keyword-editor'), null);
    assert.equal(decodeURIComponent(new URL(doc.querySelector('.zcw-search-btn').href).pathname), '/s/The Thing/');
    assert.equal(new URL(doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword'), 'The Thing');
    assert.equal(decodeURIComponent(new URL(doc.querySelector('.zcw-soquark-btn').href).pathname), '/s/The Thing.html');
    edit.click(); doc.querySelector('.zcw-keyword-editor input').value = '自定义 Beta';
    doc.querySelector('.zcw-keyword-apply').click();
    assert.equal(new URL(doc.querySelector('.zcw-bilibili-btn').href).searchParams.get('keyword'), '自定义 Beta');
    doc.querySelector('.zcw-soquark-btn').click();
    assert.equal(decodeURIComponent(new URL(tabs[0]).pathname), '/s/自定义 Beta.html');
    const before = doc.querySelector('.zcw-soquark-btn').href;
    edit.click(); doc.querySelector('.zcw-keyword-editor input').value = '别的';
    doc.querySelector('.zcw-keyword-editor').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.zcw-keyword-editor'), null);
    assert.equal(doc.querySelector('.zcw-soquark-btn').href, before);
    assert.deepEqual(storage, []);
});

test('空关键词不应用；无中文或英文候选时禁用对应切换', async t => {
    const { doc } = await boot(t, page(item(1, 8, 2000, 'Spider-Man')));
    doc.querySelector('.zcw-keyword-edit').click();
    assert.equal(doc.querySelector('[data-language=chinese]').disabled, true);
    doc.querySelector('.zcw-keyword-editor input').value = '  ';
    doc.querySelector('.zcw-keyword-apply').click();
    assert.ok(doc.querySelector('.zcw-keyword-editor'));
    assert.match(doc.querySelector('.zcw-keyword-editor').textContent, /不能为空/);
    doc.querySelector('.zcw-keyword-cancel').click();
    assert.equal(doc.querySelector('.zcw-keyword-editor'), null);
});

test('中创清洗后空词不能应用为当前页链接', async t => {
    const { doc } = await boot(t);
    const before = doc.querySelector('.zcw-search-btn').href;
    doc.querySelector('.zcw-keyword-edit').click();
    doc.querySelector('.zcw-keyword-editor input').value = 'Re:';
    doc.querySelector('.zcw-keyword-apply').click();
    assert.equal(doc.querySelector('.zcw-search-btn').href, before);
    assert.ok(doc.querySelector('.zcw-keyword-editor'));
    assert.match(doc.querySelector('.zcw-keyword-editor').textContent, /有效片名|无法/);
});

test('英文别名在em外时仍可切换，纯中文影片禁用英文切换', async t => {
    const { doc } = await boot(t, page(item(1, 8, 2000, '<em>你的名字。</em> / Your Name')));
    doc.querySelector('.zcw-keyword-edit').click();
    const english = doc.querySelector('[data-language=english]');
    assert.equal(english.disabled, false); english.click();
    assert.equal(doc.querySelector('.zcw-keyword-editor input').value, 'Your Name');
    const b = await boot(t, page(item(2, 8, 2000, '流浪地球')));
    b.doc.querySelector('.zcw-keyword-edit').click();
    assert.equal(b.doc.querySelector('[data-language=english]').disabled, true);
});

test('英文在前或含正式斜杠的英文名可完整切换', async t => {
    for (const [raw, expected] of [['The Thing 怪形前传', 'The Thing'], ['变脸 Face/Off', 'Face/Off'], ['Face/Off / 变脸', 'Face/Off']]) {
        const { doc } = await boot(t, page(item(1, 8, 2000, raw)));
        doc.querySelector('.zcw-keyword-edit').click();
        const english = doc.querySelector('[data-language=english]');
        assert.equal(english.disabled, false, raw); english.click();
        assert.equal(doc.querySelector('.zcw-keyword-editor input').value, expected, raw);
    }
});

test('输入法合成中的Enter不提交', async t => {
    const { doc, win } = await boot(t);
    doc.querySelector('.zcw-keyword-edit').click();
    const input = doc.querySelector('.zcw-keyword-editor input');
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    assert.ok(doc.querySelector('.zcw-keyword-editor'), '输入法选字期间不关闭');
    doc.querySelector('.zcw-keyword-cancel').click();
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
