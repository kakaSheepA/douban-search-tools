import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const key = 'zcw.searchSites.v1';
async function boot(t, { info = '', saved = [], failSave = false, url = 'https://www.douban.com/doulist/123/' } = {}) {
    const subject = url.includes('/subject/');
    const html = `<div id="content"><div class="article">${subject ? '<h1><span property="v:itemreviewed">暗黑 第三季</span><span class="year">(2020)</span></h1><div id="info">' + info + '</div>' : '<div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/123/">暗黑 第三季 Dark Season 3</a></div><div class="abstract">年份: 2020</div>' + info + '</div>'}</div></div>`;
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true }); t.after(() => dom.window.close());
    const win = dom.window, reads = [], writes = [], tabs = [];
    win.GM_getValue = k => { reads.push(k); return saved; };
    win.GM_setValue = (k, v) => { if (failSave) throw Error('disk'); writes.push([k, JSON.parse(JSON.stringify(v))]); };
    win.GM_openInTab = u => tabs.push(u);
    win.eval(source); await new Promise(r => setTimeout(r, 35));
    return { win, doc: win.document, Z: win.__ZCW__, reads, writes, tabs };
}
function more(doc) { doc.querySelector('.zcw-more-toggle').click(); return doc.querySelector('.zcw-more-menu'); }
function settings(doc) { more(doc).querySelector('[data-zcw-action=settings]').click(); return doc.querySelector('.zcw-site-settings'); }
function add(doc, name = '自选', template = 'https://example.com/search?q={q}') {
    doc.querySelector('[name=siteName]').value = name;
    doc.querySelector('[name=siteTemplate]').value = template;
    doc.querySelector('.zcw-site-add').click();
}
test('IMDb/TMDB无准确标识时按中文优先搜索，保留原生修饰键，开关同步新地址', async t => {
    const { doc, win, tabs, reads, writes } = await boot(t);
    assert.deepEqual(reads, []); const menu = more(doc);
    const imdb = menu.querySelector('.zcw-imdb-link'), tmdb = menu.querySelector('.zcw-tmdb-link');
    assert.ok(imdb); assert.ok(tmdb); assert.equal(imdb.tagName, 'A');
    assert.equal(new URL(imdb.href).searchParams.get('q'), '暗黑 第三季');
    assert.equal(new URL(tmdb.href).searchParams.get('query'), '暗黑 第三季');
    const event = new win.MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
    imdb.dispatchEvent(event); assert.equal(event.defaultPrevented, false); assert.equal(tabs.length, 0);
    menu.querySelector('[data-zcw-action=year]').click(); menu.querySelector('[data-zcw-action=season]').click();
    assert.equal(new URL(tmdb.href).searchParams.get('query'), '暗黑 2020');
    assert.deepEqual(reads, [key]); assert.deepEqual(writes, []);
});
test('准确IMDb/TMDB链接直达，仅限本条目，忽略伪造域名与影评链接', async t => {
    const { doc } = await boot(t, { info: '<a href="https://www.imdb.com/title/tt5753856/">IMDb</a><a href="https://www.themoviedb.org/tv/70523-dark">TMDB</a>' });
    const m = more(doc);
    assert.equal(m.querySelector('.zcw-imdb-link').href, 'https://www.imdb.com/title/tt5753856/');
    assert.equal(m.querySelector('.zcw-tmdb-link').href, 'https://www.themoviedb.org/tv/70523');
    const b = await boot(t, { info: '<div class="comment"><a href="https://www.imdb.com/title/tt1234567/">评论推荐</a></div><a href="https://www.themoviedb.org.evil.test/movie/5">伪造</a>' });
    const fallback = more(b.doc);
    assert.match(fallback.querySelector('.zcw-imdb-link').href, /\/find\//);
    assert.match(fallback.querySelector('.zcw-tmdb-link').href, /\/search\?/);
});
test('详情页从info的IMDb文字编号直达，侧栏不参与', async t => {
    const { doc } = await boot(t, { url: 'https://movie.douban.com/subject/123/', info: '<span class="pl">IMDb:</span> tt5753856' });
    assert.equal(more(doc).querySelector('.zcw-imdb-link').href, 'https://www.imdb.com/title/tt5753856/');
});
test('自定义站点添加保存，编码片名，恢复配置仅访问独立设置键', async t => {
    const b = await boot(t); settings(b.doc); add(b.doc, '自选', 'https://example.com/s/{q}?from=douban');
    b.doc.querySelector('.zcw-site-save').click();
    assert.equal(b.writes.length, 1); assert.equal(b.writes[0][0], key);
    assert.equal(b.doc.querySelector('.zcw-site-settings'), null);
    const link = more(b.doc).querySelector('.zcw-custom-link');
    assert.equal(decodeURIComponent(new URL(link.href).pathname), '/s/暗黑 第三季');
    const c = await boot(t, { saved: b.writes[0][1] });
    assert.equal(more(c.doc).querySelector('.zcw-custom-link').textContent, '自选');
    assert.deepEqual(c.reads, [key]);
});
test('设置取消不生效，停用、排序、删除正常且不改动原三站', async t => {
    const b = await boot(t, { saved: [{ name: '甲', template: 'https://a.test/?q={q}', enabled: true }, { name: '乙', template: 'https://b.test/?q={q}', enabled: true }] });
    let form = settings(b.doc); form.querySelector('[data-site-action=delete]').click(); form.querySelector('.zcw-site-cancel').click();
    assert.equal(more(b.doc).querySelectorAll('.zcw-custom-link').length, 2);
    b.doc.querySelector('[data-zcw-action=settings]').click(); form = b.doc.querySelector('.zcw-site-settings');
    form.querySelector('[data-site-action=down]').click();
    form.querySelector('input[type=checkbox]').click(); form.querySelector('.zcw-site-save').click();
    assert.equal(more(b.doc).querySelector('.zcw-custom-link').textContent, '甲');
    assert.equal(b.doc.querySelectorAll('.zcw-group > a').length, 4);
    assert.equal(b.writes[0][1][0].name, '乙'); assert.equal(b.writes[0][1][0].enabled, false);
});
test('拒绝无占位符、脚本、凭据、host占位符；错误配置不执行，保存失败可重试', async t => {
    const b = await boot(t, { failSave: true }); const form = settings(b.doc);
    for (const template of ['javascript:alert({q})', 'https://example.com/', 'https://{q}.test/', 'https://u:p@example.com/?q={q}']) {
        add(b.doc, '非法', template); assert.equal(form.querySelectorAll('.zcw-site-row').length, 0);
        assert.ok(form.querySelector('[role=alert]').textContent);
    }
    add(b.doc); form.querySelector('.zcw-site-save').click();
    assert.ok(b.doc.querySelector('.zcw-site-settings')); assert.match(form.querySelector('[role=alert]').textContent, /保存失败/);
    const c = await boot(t, { saved: [{ name: '<img onerror=x>', template: 'javascript:{q}', enabled: true }] });
    assert.equal(more(c.doc).querySelector('.zcw-custom-link'), null);
});
