import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const movie = (id = 1, name = '电影甲') => `<html><head><title>${name}</title></head><body><div id="content"><div class="article"><h1><span property="v:itemreviewed">${name}</span><span class="year">(2020)</span></h1><div id="info"><span><span class="pl">导演</span>: <a rel="v:directedBy" href="/celebrity/11/">张导演</a></span><br><span><span class="pl">主演</span>: <a rel="v:starring" href="https://www.douban.com/personage/22/">李演员</a></span></div><div id="recommendations"><dl><dt><a href="/subject/2/"><img alt="电影乙"></a></dt><dd><a href="/subject/2/">电影乙</a></dd></dl></div></div><div class="aside"><a href="/subject/99/">广告</a></div></div><script>window.__injected=1</script></body></html>`;
const list = '<div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/1/">电影甲</a></div></div></div></div>';
const person = '<div id="content"><div class="article"><h1>李演员</h1><div id="recent_movies"><a href="https://movie.douban.com/subject/1/">电影甲</a><a href="https://movie.douban.com/subject/3/">电影丙</a></div></div></div>';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function boot(t, { html = list, url = 'https://www.douban.com/doulist/123/', responder } = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true }); t.after(() => dom.window.close());
    const win = dom.window, calls = [], tabs = [], storage = [], aborts = [];
    win.GM_openInTab = u => tabs.push(u); win.GM_getValue = (k,d) => { storage.push(k); return d; };
    win.GM_xmlhttpRequest = opts => { calls.push(opts); if (responder) responder(opts, calls.length); return { abort: () => { aborts.push(opts.url); opts.onabort?.(); } }; };
    win.eval(source); await wait(35);
    return { win, doc: win.document, G: win.__ZCW__.MovieGraph, calls, tabs, storage, aborts };
}
function open(doc) { doc.querySelector('.zcw-more-toggle').click(); doc.querySelector('[data-zcw-action=graph]').click(); }
function respond(opts, html, extra = {}) { opts.onload({ status: 200, responseText: html, finalUrl: opts.url, ...extra }); }
test('解析导演、演员与豆瓣推荐，按准确ID去重，推荐不是续作或同主演', async t => {
    const { G, win } = await boot(t); assert.ok(G, 'graph module required');
    const doc = new win.DOMParser().parseFromString(movie(), 'text/html');
    const data = G.parseMovie(doc, 'https://movie.douban.com/subject/1/');
    assert.equal(data.nodes.length, 4); assert.equal(data.edges.length, 3);
    assert.deepEqual(Array.from(data.edges, e => e.relation).sort(), ['主演', '导演', '豆瓣推荐'].sort());
    assert.equal(data.nodes.find(n => n.title === '电影乙').id, 'movie:2');
    assert.equal(data.nodes.some(n => n.id === 'movie:99'), false);
    assert.equal(win.__injected, undefined);
});
test('拒绝不受支持的页面/伪造域名/人物首页无作品区，不把任意影片链接当作品', async t => {
    const { G, win } = await boot(t); assert.ok(G);
    for (const url of ['https://evil.test/subject/1/', 'https://movie.douban.com.evil.test/subject/1/', 'javascript:alert(1)', 'https://movie.douban.com/subject/1/photos', 'https://www.douban.com/doulist/1/']) assert.equal(G.normalizeUrl(url), null);
    const doc = new win.DOMParser().parseFromString('<h1>演员</h1><a href="https://movie.douban.com/subject/8/">影评里的电影</a>', 'text/html');
    const data = G.parsePerson(doc, 'https://www.douban.com/personage/22/');
    assert.equal(data.edges.length, 0);
});
test('详情页先使用当前DOM，不发请求；关闭恢复焦点，不写存储', async t => {
    const { doc, calls, G, storage } = await boot(t, { html: movie(), url: 'https://movie.douban.com/subject/1/' });
    open(doc); await wait(0); assert.ok(doc.querySelector('.zcw-graph'));
    assert.equal(calls.length, 0); assert.equal(G.snapshot().nodes.length, 4);
    doc.querySelector('.zcw-graph-close').click(); assert.equal(doc.querySelector('.zcw-graph'), null);
    assert.equal(doc.activeElement.className, 'zcw-more-toggle');
    assert.deepEqual(storage, ['zcw.searchSites.v1']);
});
test('按需请求电影与人物，重复展开不重复抓取，当前图谱内缓存且无持久化', async t => {
    const { doc, calls, G } = await boot(t, { responder: opts => respond(opts, opts.url.includes('/subject/') ? movie() : person) });
    open(doc); await wait(0); assert.equal(calls.length, 1);
    assert.equal(G.snapshot().nodes.length, 4);
    doc.querySelector('[data-graph-node="person:personage:22"]').click(); doc.querySelector('.zcw-graph-expand').click(); await wait(0);
    assert.equal(calls.length, 2); assert.ok(G.snapshot().nodes.some(n => n.id === 'movie:3'));
    assert.ok(G.snapshot().edges.some(e => e.relation === '人物页作品'));
    doc.querySelector('.zcw-graph-expand').click(); await wait(0); assert.equal(calls.length, 2);
});
test('验证页、跳转、失败、超时可见且仅显式重试，失败不标记已展开', async t => {
    const { doc, calls, G } = await boot(t);
    open(doc); assert.equal(calls.length, 1);
    respond(calls[0], '<title>豆瓣</title>验证码', { finalUrl: 'https://sec.douban.com/c?r=x' }); await wait(0);
    assert.match(doc.querySelector('.zcw-graph-status').textContent, /验证|拦截/);
    assert.equal(G.snapshot().nodes.length, 1); assert.equal(calls.length, 1);
    doc.querySelector('.zcw-graph-expand').click(); assert.equal(calls.length, 2);
    calls[1].ontimeout(); await wait(0); assert.match(doc.querySelector('.zcw-graph-status').textContent, /超时/);
    doc.querySelector('.zcw-graph-expand').click(); respond(calls[2], movie()); await wait(0);
    assert.equal(G.snapshot().nodes.length, 4);
});
test('关闭中止请求，迟到回调不写入已关闭或新图谱；Escape也可关闭', async t => {
    const { doc, win, calls, aborts, G } = await boot(t);
    open(doc); doc.querySelector('.zcw-graph-close').click(); assert.equal(aborts.length, 1);
    respond(calls[0], movie()); await wait(0); assert.equal(G.snapshot(), null);
    open(doc); assert.equal(calls.length, 2);
    respond(calls[0], movie()); await wait(0); assert.equal(G.snapshot().nodes.length, 1);
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.zcw-graph'), null);
});
test('人物作品页只按观察到的白名单作品链接加载，图谱有容量上限与提示', async t => {
    const { doc, G, calls } = await boot(t, { responder: opts => {
        if (opts.url.includes('/subject/')) respond(opts, movie());
        else if (opts.url.endsWith('/personage/22/')) respond(opts, '<div id="content"><div class="article"><h1>李演员</h1><a href="/personage/22/creations">全部作品</a></div></div>');
        else respond(opts, '<div id="content"><div class="article"><h1>李演员作品</h1>' + Array.from({length:100}, (_,i) => `<a href="https://movie.douban.com/subject/${i+100}/">电影${i}</a>`).join('') + '</div></div>');
    } });
    open(doc); await wait(0);
    doc.querySelector('[data-graph-node="person:personage:22"]').click(); doc.querySelector('.zcw-graph-expand').click(); await wait(0); await wait(0);
    assert.equal(calls.length, 3); assert.ok(G.snapshot().nodes.length <= 80);
    assert.match(doc.querySelector('.zcw-graph-note').textContent, /最多|上限/);
});
test('键盘选择节点后焦点保留，两个同名人物按URL分别保留', async t => {
    const html = movie().replace('</div><div id="recommendations">', '<a rel="v:starring" href="/celebrity/33/">李演员</a></div><div id="recommendations">');
    const { doc, G } = await boot(t, { html, url: 'https://movie.douban.com/subject/1/' });
    open(doc); await wait(0);
    assert.equal(G.snapshot().nodes.filter(n => n.title === '李演员').length, 2);
    const b = doc.querySelector('[data-graph-node="person:personage:22"]'); b.focus(); b.click();
    assert.equal(doc.activeElement.dataset.graphNode, 'person:personage:22');
});
