import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const base = 'https://www.douban.com/doulist/987654/';
const item = (id, score, year, book = false) => `<div class="doulist-item" id="item-${id}"><div class="title"><a href="https://${book ? 'book' : 'movie'}.douban.com/subject/${id}/">影片${id}</a></div><div class="rating"><span class="rating_nums">${score ?? ''}</span></div><div class="abstract">导演: 某人<br>年份：${year ?? '未知'}</div><blockquote>评语：2099</blockquote><time>2026-10-24</time></div>`;
const page = (items, next = null, total = 1) => `<html><head></head><body><div id="content"><h1>通用片单</h1><div class="article">${items}<div class="paginator"><span class="thispage" data-total-page="${total}">1</span>${next ? `<span class="next"><a href="${next}">后页</a></span>` : ''}</div></div></div></body></html>`;
const ids = doc => [...doc.querySelectorAll('.article > .doulist-item')].map(n => n.id);
async function boot(t, html, { url = base, fetcher, fastTimeout = false } = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const win = dom.window, requests = [], tabs = [], writes = [];
    win.GM_getValue = (k, d) => d;
    win.GM_setValue = (...args) => writes.push(args);
    win.GM_listValues = () => [];
    win.GM_openInTab = u => tabs.push(u);
    const timeout = win.setTimeout.bind(win);
    win.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 20000 && fastTimeout ? 5 : ms === 600 ? 1 : ms, ...args);
    win.fetch = async (u, opts) => {
        requests.push({ u: String(u), opts });
        return fetcher ? fetcher(String(u), opts) : { ok: true, url: String(u), text: async () => html };
    };
    win.eval(source);
    await new Promise(r => setTimeout(r, 40));
    return { win, doc: win.document, requests, tabs, writes };
}
function choose(doc, key) {
    const select = doc.querySelector('#zcw-doulist-sort select');
    assert.ok(select, '影视片单应注入通用排序工具栏');
    select.value = key;
    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}
async function settled(doc) {
    for (let n = 0; n < 150; n++) {
        if (doc.querySelector('#zcw-doulist-sort')?.getAttribute('aria-busy') === 'false') return;
        await new Promise(r => setTimeout(r, 10));
    }
    assert.fail('排序或加载未完成');
}

test('只读取评分和年份，不使用评语或加入时间；稳定排序，未知末尾', async t => {
    const { win, doc } = await boot(t, page(item(1, 8, 2000)));
    assert.ok(win.__ZCW__.DoulistSort, '应提供独立片单排序模块');
    const sort = win.__ZCW__.DoulistSort;
    assert.equal(sort.readMeta(doc.querySelector('.doulist-item')).year, 2000);
    const box = doc.createElement('div'); box.innerHTML = item(3, null, null);
    assert.equal(sort.readMeta(box.firstChild).year, null);
    assert.equal(sort.readMeta(box.firstChild).rating, null);
});

test('全量分页排序、重复切换不重抓、书籍固定槽位、原节点事件和搜索功能保留', async t => {
    const html = page(item(1, 7, 2005) + item(90, 10, 2025, true) + item(2, null, null), '?start=25&playable=1', 2);
    const second = page(item(3, 9, 1990) + item(4, 7, 2020));
    const { doc, requests, writes, tabs, win } = await boot(t, html, { url: base + '?playable=1', fetcher: async u => ({ ok: true, url: u, text: async () => second }) });
    const original = doc.getElementById('item-1');
    let clicks = 0; original.addEventListener('custom', () => clicks++);
    choose(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-3', 'item-90', 'item-1', 'item-4', 'item-2']);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].u).searchParams.get('playable'), '1');
    assert.equal(requests[0].opts.credentials, 'same-origin');
    assert.equal(doc.querySelector('.paginator').hidden, true);
    choose(doc, 'year-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-4', 'item-90', 'item-1', 'item-3', 'item-2']);
    choose(doc, 'year-asc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-3', 'item-90', 'item-1', 'item-4', 'item-2']);
    choose(doc, 'rating-asc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1', 'item-90', 'item-4', 'item-3', 'item-2']);
    choose(doc, 'original'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1', 'item-90', 'item-2', 'item-3', 'item-4']);
    assert.equal(doc.getElementById('item-1'), original);
    original.dispatchEvent(new win.Event('custom')); assert.equal(clicks, 1);
    assert.equal(requests.length, 1);
    assert.equal(doc.querySelectorAll('.zcw-search-btn').length, 4);
    assert.equal(doc.querySelectorAll('.zcw-bilibili-btn').length, 4);
    assert.equal(doc.querySelector('#item-90 .zcw-search-btn'), null);
    assert.equal(writes.length, 0);
    doc.querySelector('#item-3 .zcw-bilibili-btn').click();
    assert.equal(tabs.length, 1);
    assert.equal(writes.length, 0);
    win.__ZCW__.process(); win.__ZCW__.process();
    assert.equal(doc.querySelectorAll('#zcw-doulist-sort').length, 1);
});

test('任意片单 ID，从中间页进入仍按第一页至末页收集', async t => {
    const first = page(item(1, 8, 1980), '?start=25', 2);
    const second = page(item(2, 9, 2000), null, 2);
    const { doc, requests } = await boot(t, second, { url: base + '?start=25', fetcher: async u => ({ ok: true, url: u, text: async () => first }) });
    choose(doc, 'year-asc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1', 'item-2']);
    assert.equal(new URL(requests[0].u).searchParams.get('start'), '0');
    assert.equal(requests.length, 1);
});

test('失败不提交部分列表，提示错误并可重试', async t => {
    let fail = true;
    const html = page(item(1, 5, 2000), '?start=25', 2);
    const { doc, writes } = await boot(t, html, { fetcher: async u => ({ ok: !fail, status: 429, url: u, text: async () => page(item(2, 9, 1990)) }) });
    choose(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1']);
    assert.equal(doc.querySelector('.paginator').hidden, false);
    assert.match(doc.querySelector('#zcw-doulist-sort').textContent, /失败|429/);
    fail = false; choose(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-2', 'item-1']); assert.equal(writes.length, 0);
});

test('分页链接省略筛选参数时仍继承当前筛选，不能混入未筛选数据', async t => {
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), '?start=25', 2), {
        url: base + '?playable=1&sub_type=movie',
        fetcher: async u => ({ ok: true, url: u, text: async () => page(item(2, 9, 1990)) }),
    });
    choose(doc, 'rating-desc'); await settled(doc);
    const query = new URL(requests[0].u).searchParams;
    assert.equal(query.get('playable'), '1');
    assert.equal(query.get('sub_type'), 'movie');
});

for (const action of ['add', 'remove']) test(`全量加载后原生${action}条目，不得以旧缓存覆盖用户变更`, async t => {
    const { doc } = await boot(t, page(item(1, 5, 2000) + item(2, 9, 1990)));
    choose(doc, 'rating-desc'); await settled(doc);
    if (action === 'add') doc.querySelector('.paginator').insertAdjacentHTML('beforebegin', item(3, 7, 2005));
    else doc.querySelector('#item-1').remove();
    const changed = ids(doc);
    choose(doc, 'year-asc'); await settled(doc);
    assert.deepEqual(ids(doc), changed);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /变化.*刷新/);
});

for (const [name, next, remote] of [
    ['跨域分页', 'https://evil.example/doulist/987654/?start=25', null],
    ['不同片单分页', '/doulist/666/?start=25', null],
    ['分页循环', '?start=25', page(item(2, 8, 1990), '?start=25', 2)],
    ['验证页', '?start=25', '<html><body>请完成安全验证</body></html>'],
    ['分页缺失', null, null],
]) test(`${name}不得显示为全量成功`, async t => {
    const { doc, requests } = await boot(t, page(item(1, 5, 2000), next, 2), { fetcher: async u => ({ ok: true, url: u, text: async () => remote }) });
    choose(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1']);
    assert.match(doc.querySelector('#zcw-doulist-sort').textContent, /失败/);
    if (name === '跨域分页' || name === '不同片单分页') assert.equal(requests.length, 0);
});

test('取消中止请求，原列表和分页不变', async t => {
    let signal;
    const { doc } = await boot(t, page(item(1, 5, 2000), '?start=25', 2), { fetcher: (u, opts) => new Promise((resolve, reject) => {
        signal = opts.signal;
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }) });
    choose(doc, 'rating-desc');
    for (let i = 0; !signal && i < 50; i++) await new Promise(r => setTimeout(r, 5));
    doc.querySelector('#zcw-doulist-sort button').click(); await settled(doc);
    assert.equal(signal.aborted, true);
    assert.deepEqual(ids(doc), ['item-1']);
    assert.equal(doc.querySelector('.paginator').hidden, false);
    assert.match(doc.querySelector('#zcw-doulist-sort').textContent, /取消/);
});

test('导入条目去除脚本、事件和危险链接', async t => {
    const remote = page(item(2, 9, 1990).replace('</div>', '<script>window.bad=1</script><img onerror="window.bad=2" src="x"><a href="javascript:alert(1)">危险</a></div>'));
    const { doc, win } = await boot(t, page(item(1, 5, 2000), '?start=25', 2), { fetcher: async u => ({ ok: true, url: u, text: async () => remote }) });
    choose(doc, 'rating-desc'); await settled(doc);
    assert.equal(doc.querySelector('#item-2 script'), null);
    assert.equal(doc.querySelector('#item-2 [onerror]'), null);
    assert.equal(doc.querySelector('#item-2 a[href^="javascript:"]'), null);
    assert.equal(win.bad, undefined);
});

test('请求超时中止网络并恢复可操作状态，显示超时而非用户取消', async t => {
    const { doc } = await boot(t, page(item(1, 5, 2000), '?start=25', 2), {
        fastTimeout: true,
        fetcher: (u, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
    });
    choose(doc, 'rating-desc'); await settled(doc);
    assert.deepEqual(ids(doc), ['item-1']);
    assert.match(doc.querySelector('#zcw-doulist-sort [role=status]').textContent, /超时/);
    assert.equal(doc.querySelector('#zcw-doulist-sort select').disabled, false);
    assert.equal(doc.querySelector('.paginator').hidden, false);
});

test('普通想看列表和纯书籍豆列不添加排序栏', async t => {
    const a = await boot(t, page(item(1, 8, 2000)), { url: 'https://movie.douban.com/people/test/wish' });
    assert.equal(a.doc.querySelector('#zcw-doulist-sort'), null);
    const b = await boot(t, page(item(90, 8, 2000, true)));
    assert.equal(b.doc.querySelector('#zcw-doulist-sort'), null);
});
