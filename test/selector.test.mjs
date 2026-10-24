/** 当前精简版的页面识别/注入回归；旧状态/资源套件已备份。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const fixture = name => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const shell = content => `<html><body><div id="content"><div class="article">${content}</div></div></body></html>`;
const movie = (id, title) => `<article><figure><a href="/subject/${id}/"><img alt="${title}"></a></figure><h3><a href="/subject/${id}/">${title}</a></h3></article>`;
async function boot(t, html, url = 'https://movie.douban.com/mine?status=wish') {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const win = dom.window, tabs = [];
    win.GM_openInTab = (...args) => tabs.push(args);
    win.eval(source);
    await new Promise(r => setTimeout(r, 35));
    return { win, doc: win.document, tabs, Z: win.__ZCW__ };
}

for (const [name, url] of [
    ['grid想看', 'https://movie.douban.com/mine?status=wish'],
    ['在看', 'https://movie.douban.com/people/test/do'],
    ['看过', 'https://movie.douban.com/people/test/collect'],
]) test(`${name}每条各有四个搜索入口，无重复注入`, async t => {
    const { doc, Z } = await boot(t, fixture('douban-wish-grid.html'), url);
    for (const sel of ['.zcw-search-btn', '.zcw-bilibili-btn', '.zcw-soquark-btn', '.zcw-pansearch-btn']) assert.equal(doc.querySelectorAll(sel).length, 15);
    Z.process(); Z.process();
    assert.equal(doc.querySelectorAll('.zcw-group').length, 15);
    assert.equal(doc.querySelectorAll('#zcw-style').length, 1);
    const first = doc.querySelector('.zcw-search-btn');
    assert.equal(first.getAttribute('data-zcw-title'), '暴裂无声');
    assert.equal(first.target, '_blank'); assert.match(first.rel, /noopener/);
    assert.equal(new URL(first.href).search, '');
});

test('list视图正确识别，隐藏详情不注入', async t => {
    const { doc } = await boot(t, fixture('douban-wish-list.html'), 'https://movie.douban.com/mine?status=wish&mode=list');
    assert.equal(doc.querySelectorAll('.zcw-group').length, doc.querySelectorAll('.list-view > li.item').length);
    assert.ok(doc.querySelector('.zcw-group'));
    assert.equal(doc.querySelector('.hide .zcw-group'), null);
});

test('详情页只处理主影片，不处理侧栏推荐', async t => {
    const { doc, tabs } = await boot(t, fixture('douban-subject.html'), 'https://movie.douban.com/subject/4920389/');
    assert.equal(doc.querySelectorAll('.zcw-group').length, 1);
    assert.equal(doc.querySelector('.aside .zcw-group'), null);
    doc.querySelector('.zcw-search-btn').click();
    assert.equal(decodeURIComponent(new URL(tabs[0][0]).pathname), '/s/头号玩家/');
});

test('片单只注入影片，不注入书籍，两个豆瓣域均生效', async t => {
    for (const host of ['www.douban.com', 'douban.com']) {
        const { doc } = await boot(t, fixture('douban-doulist.html'), `https://${host}/doulist/321/`);
        assert.equal(doc.querySelectorAll('.zcw-group').length, 3);
        assert.equal(doc.querySelector('a[href*="book.douban.com"]').parentElement.querySelector('.zcw-group'), null);
    }
});

test('电影首页、改名class结构及相对影视链接可识别', async t => {
    const { doc } = await boot(t, shell(movie(111, '头号玩家 / Ready Player One') + movie(222, 'Spider-Man')), 'https://movie.douban.com/');
    assert.equal(doc.querySelectorAll('.zcw-group').length, 2);
    assert.equal(doc.querySelector('figure .zcw-group'), null);
    assert.equal(doc.querySelector('.zcw-search-btn').getAttribute('data-zcw-title'), '头号玩家');
});

test('MutationObserver自动补齐动态条目', async t => {
    const { doc } = await boot(t, shell(movie(111, '头号玩家') + movie(222, '蜘蛛侠')));
    doc.querySelector('.article').insertAdjacentHTML('beforeend', movie(333, '怪形前传 The Thing'));
    await new Promise(r => setTimeout(r, 350));
    assert.equal(doc.querySelectorAll('.zcw-group').length, 3);
    assert.equal(doc.querySelectorAll('.zcw-soquark-btn')[2].getAttribute('data-zcw-title'), '怪形前传');
});

test('侧栏、广告及非影视页面不注入', async t => {
    const { doc } = await boot(t, shell(movie(111, '正片') + '<div class="aside">' + movie(222, '推荐') + '</div><div id="dale_ad">' + movie(333, '广告') + '</div>'));
    assert.equal(doc.querySelectorAll('.zcw-group').length, 1);
    for (const url of ['https://www.douban.com/group/test/', 'https://book.douban.com/subject/123/', 'https://movie.douban.com/review/123/']) {
        const r = await boot(t, shell(movie(111, '正片')), url);
        assert.equal(r.doc.querySelector('.zcw-group'), null);
    }
});

test('重复影片在不同条目各有入口，海报与标题不会变两条', async t => {
    const { doc } = await boot(t, shell(movie(111, '蜘蛛侠') + movie(111, '蜘蛛侠')));
    assert.equal(doc.querySelectorAll('.zcw-group').length, 2);
    assert.equal(doc.querySelector('figure .zcw-group'), null);
});

test('Ctrl点击使用原生链接，不重复打开；GM缺失时四个入口可兜底', async t => {
    const { doc, win, tabs } = await boot(t, shell(movie(111, '蜘蛛侠')));
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    doc.querySelector('.zcw-search-btn').dispatchEvent(event);
    assert.equal(event.defaultPrevented, false); assert.equal(tabs.length, 0);
    delete win.GM_openInTab;
    const opened = []; win.open = (...args) => opened.push(args);
    for (const el of doc.querySelectorAll('.zcw-group > a, .zcw-group > button')) el.click();
    assert.equal(opened.length, 4);
    assert.ok(opened.every(args => args[1] === '_blank' && args[2] === 'noopener'));
});

test('中创长词限制保留，外部搜索不截断', async t => {
    const { Z } = await boot(t, shell(movie(111, '蜘蛛侠')));
    const title = '这是一个用于验证保留完整中文片名而不截断的长标题';
    assert.ok(decodeURIComponent(new URL(Z.buildSearchUrl(title)).pathname).slice(3, -1).length <= 18);
    assert.equal(new URL(Z.buildBilibiliSearchUrl(title)).searchParams.get('keyword'), title);
    assert.equal(decodeURIComponent(new URL(Z.buildSoquarkSearchUrl(title)).pathname), '/s/' + title + '.html');
});
