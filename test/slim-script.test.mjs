import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const fixture = name => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
async function boot(t, html, url) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const win = dom.window, storage = [], tabs = [];
    for (const key of ['GM_getValue', 'GM_setValue', 'GM_listValues', 'GM_deleteValue']) win[key] = (...args) => { storage.push([key, ...args]); return args[1]; };
    win.GM_openInTab = u => tabs.push(u);
    win.eval(source);
    await new Promise(r => setTimeout(r, 40));
    return { win, doc: win.document, storage, tabs };
}

test('列表四个搜索按钮，无状态/资源/影视库UI，全部搜索零存储访问', async t => {
    const { doc, storage, tabs, win } = await boot(t, fixture('douban-wish-grid.html'), 'https://movie.douban.com/people/test/wish');
    assert.equal(doc.querySelectorAll('.zcw-search-btn').length, 15);
    assert.equal(doc.querySelectorAll('.zcw-bilibili-btn').length, 15);
    assert.equal(doc.querySelectorAll('.zcw-soquark-btn').length, 15);
    assert.equal(doc.querySelectorAll('.zcw-pansearch-btn').length, 15);
    assert.equal(doc.querySelector('.zcw-status-label, .zcw-res-chip, .zcw-library-chip, #zcw-library, #zcw-toolbar, .zcw-panel'), null);
    for (const selector of ['.zcw-search-btn', '.zcw-bilibili-btn', '.zcw-soquark-btn', '.zcw-pansearch-btn']) doc.querySelector(selector).click();
    assert.equal(tabs.length, 4);
    assert.equal(new URL(tabs[0]).searchParams.has('zcw_id'), false);
    assert.deepEqual(storage, []);
    for (const name of ['ResourceStore', 'MovieLibrary', 'ResourceWorkflow', 'saveMovie', 'getMovie', 'upgradeStatus']) assert.equal(win.__ZCW__[name], undefined);
});

test('中创页不启动、不检测、不读写存储', async t => {
    const { doc, storage, win } = await boot(t, fixture('zc-result-withid.html'), 'https://www.zhongchuangwl.com/s/test/?zcw_id=123');
    assert.equal(win.__ZCW__.detectPage(), null);
    assert.equal(doc.querySelector('.zcw-group'), null);
    assert.deepEqual(storage, []);
});

test('原影视库书签回到普通豆瓣首页，不再接管页面', async t => {
    const { doc, storage, win } = await boot(t, fixture('douban-home.html'), 'https://movie.douban.com/?zcw=library');
    assert.equal(win.__ZCW__.detectPage().type, 'home');
    assert.equal(doc.querySelector('#zcw-library, .zcw-library-chip'), null);
    assert.equal(doc.querySelector('.article > h1').textContent, '豆瓣电影');
    assert.equal(doc.querySelector('.article > h1').hidden, false);
    assert.equal(doc.querySelector('.article > p').style.display, '');
    assert.deepEqual(storage, []);
});

test('不声明中创运行范围，仅站点设置使用存储，不枚举或删除历史数据', () => {
    const header = source.split('// ==/UserScript==')[0];
    assert.doesNotMatch(header, /@match\s+https:\/\/www\.zhongchuangwl\.com/);
    assert.doesNotMatch(header, /@grant\s+GM_(listValues|deleteValue)/);
    assert.match(header, /@grant\s+GM_getValue/);
    assert.match(header, /@grant\s+GM_setValue/);
});
