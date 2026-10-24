import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const list = title => `<html><head><title>片单</title></head><body><div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/123/">${title}</a></div></div></div></div></body></html>`;
async function boot(t, html = list('怪形前传 The Thing'), url = 'https://www.douban.com/doulist/1234/') {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const win = dom.window, tabs = [], writes = [], store = {};
    win.GM_getValue = (k, d) => store[k] ?? d;
    win.GM_setValue = (k, v) => { writes.push([k, v]); store[k] = v; };
    win.GM_listValues = () => Object.keys(store);
    win.GM_openInTab = (...args) => tabs.push(args);
    win.eval(source);
    await new Promise(r => setTimeout(r, 35));
    return { win, doc: win.document, Z: win.__ZCW__, tabs, writes, store };
}

test('统一片名选择：中文优先，无中文时英文，保留正式混合名称', async t => {
    const { Z, doc } = await boot(t);
    assert.equal(typeof Z.preferredSearchTitle, 'function');
    for (const [raw, expected] of [
        ['怪形前传 The Thing', '怪形前传'], ['The Thing 怪形前传', '怪形前传'],
        ['Spider-Man / 蜘蛛侠', '蜘蛛侠'], ['蜘蛛侠 / Spider-Man / 蜘蛛人(台)', '蜘蛛侠'],
        ['The Thing', 'The Thing'], ['Spider-Man', 'Spider-Man'], ['君の名は。 / Your Name', 'Your Name'],
        ['Re: 从零开始的异世界生活 第二季 Re:ZERO', 'Re: 从零开始的异世界生活 第二季'],
        ['X战警：逆转未来 X-Men: Days of Future Past', 'X战警：逆转未来'],
        ['阿Q正传 The True Story of Ah Q', '阿Q正传'],
        ['哆啦A梦 Doraemon', '哆啦A梦'], ['头号玩家 2018 Ready Player One', '头号玩家 2018'],
        ['  Your   Name  ', 'Your Name'], ['[可播放] 蜘蛛侠 Spider-Man', '蜘蛛侠'],
        ['The Thing (豆瓣)', 'The Thing'], ['Spider-Man (台)', 'Spider-Man'], ['Face/Off', 'Face/Off'],
        ['', ''], [null, ''], [123, ''],
    ]) assert.equal(Z.preferredSearchTitle(raw), expected, raw);
    const anchor = doc.createElement('a');
    anchor.innerHTML = '<em>Face/Off</em>';
    assert.equal(Z.extractTitle(anchor), 'Face/Off');
});

test('别名段内的地区/来源标注不应被误认为中文片名', async t => {
    const { Z } = await boot(t);
    assert.equal(Z.preferredSearchTitle('Spider-Man (台) / 蜘蛛侠'), '蜘蛛侠');
    assert.equal(Z.preferredSearchTitle('The Thing (豆瓣) / 怪形前传'), '怪形前传');
});

test('中文名和日文原名同排时，仍取中文而非退回英文', async t => {
    const { Z, doc } = await boot(t);
    assert.equal(Z.preferredSearchTitle('你的名字。 君の名は。 / Your Name'), '你的名字。');
    assert.equal(Z.preferredSearchTitle('千与千寻 千と千尋の神隠し'), '千与千寻');
    const anchor = doc.createElement('a');
    anchor.innerHTML = '<em>君の名は。</em> / 你的名字。';
    assert.equal(Z.extractTitle(anchor), '你的名字');
});

test('三个搜索地址使用同一中文关键词，SoQuark 编码路径保留字', async t => {
    const { Z } = await boot(t);
    for (const raw of ['怪形前传 The Thing', 'The Thing / 怪形前传']) {
        assert.equal(decodeURIComponent(new URL(Z.buildSearchUrl(raw, '123')).pathname), '/s/怪形前传/');
        assert.equal(new URL(Z.buildBilibiliSearchUrl(raw)).searchParams.get('keyword'), '怪形前传');
        assert.equal(decodeURIComponent(new URL(Z.buildSoquarkSearchUrl(raw)).pathname), '/s/怪形前传.html');
    }
    const raw = 'Who? What# & Why';
    const u = new URL(Z.buildSoquarkSearchUrl(raw));
    assert.equal(decodeURIComponent(u.pathname), '/s/' + raw + '.html');
    assert.equal(u.search, ''); assert.equal(u.hash, '');
    assert.equal(Z.buildSoquarkSearchUrl(''), null);
    assert.equal(Z.buildSoquarkSearchUrl(null), null);
});

test('四按钮顺序、中文搜索，原三个入口均零写库', async t => {
    const { doc, tabs, writes, Z } = await boot(t);
    const buttons = [...doc.querySelectorAll('.zcw-group > a')];
    assert.deepEqual(buttons.map(n => n.textContent), ['搜中创', '搜B站', '搜夸克', '搜网盘']);
    const sq = doc.querySelector('.zcw-soquark-btn');
    assert.equal(sq.tagName, 'A'); assert.equal(sq.target, '_blank');
    let bubbled = 0; sq.parentElement.addEventListener('click', () => bubbled++);
    sq.click();
    assert.equal(tabs.length, 1); assert.equal(tabs[0][0], 'https://www.soquark.com/s/' + encodeURIComponent('怪形前传') + '.html');
    assert.equal(bubbled, 0); assert.equal(writes.length, 0);
    doc.querySelector('.zcw-bilibili-btn').click();
    assert.equal(new URL(tabs[1][0]).searchParams.get('keyword'), '怪形前传'); assert.equal(writes.length, 0);
    doc.querySelector('.zcw-search-btn').click();
    assert.equal(writes.length, 0);
    assert.equal(new URL(tabs[2][0]).searchParams.has('zcw_id'), false);
    assert.equal(tabs.length, 3);
    Z.process(); Z.process(); assert.equal(doc.querySelectorAll('.zcw-soquark-btn').length, 1);
});

test('详情页和动态新增条目也有SoQuark，英文回退不被连字符截坏', async t => {
    const html = '<html><head><title>Spider-Man (2002) - 豆瓣电影</title></head><body><div id="content"><div class="article"><h1><span property="v:itemreviewed">蜘蛛侠 Spider-Man</span></h1></div></div></body></html>';
    const { doc, Z, tabs } = await boot(t, html, 'https://movie.douban.com/subject/123/');
    doc.querySelector('.zcw-soquark-btn').click();
    assert.match(decodeURIComponent(tabs[0][0]), /蜘蛛侠\.html$/);
    assert.equal(Z.resolveSearchTitle(''), 'Spider-Man');
    const b = await boot(t);
    b.doc.querySelector('.article').insertAdjacentHTML('beforeend', '<div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/456/">The Thing</a></div></div>');
    b.Z.process();
    assert.equal(b.doc.querySelectorAll('.zcw-soquark-btn').length, 2);
    b.doc.querySelectorAll('.zcw-soquark-btn')[1].click();
    assert.equal(decodeURIComponent(new URL(b.tabs[0][0]).pathname), '/s/The Thing.html');
});

test('SoQuark Action 的GM优先、异常、window.open兜底和空关键词', async t => {
    const { Z, win, tabs, writes } = await boot(t);
    assert.equal(typeof Z.ExternalSearchAction.openSoquark, 'function');
    assert.equal(Z.ExternalSearchAction.openSoquark(''), false);
    assert.equal(Z.createSoquarkButton(''), null);
    assert.equal(Z.createSoquarkButton(null), null);
    let fallback = 0;
    win.open = (url, target, rel) => { fallback++; assert.equal(target, '_blank'); assert.equal(rel, 'noopener'); };
    Z.ExternalSearchAction.openSoquark('The Thing'); assert.equal(tabs.length, 1); assert.equal(fallback, 0);
    win.GM_openInTab = () => { throw new Error('blocked'); };
    assert.equal(Z.ExternalSearchAction.openSoquark('The Thing'), false); assert.equal(fallback, 0);
    delete win.GM_openInTab;
    assert.equal(Z.ExternalSearchAction.openSoquark('The Thing'), true); assert.equal(fallback, 1);
    assert.equal(writes.length, 0);
});
