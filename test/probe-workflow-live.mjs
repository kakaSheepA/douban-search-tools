/** 真实Chrome开发验证：原生链接、关键词编辑、全量组合筛选、受控503后的续载。
 * GM API模拟；不会访问或修改已安装的油猴扩展。
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
const out = path.resolve('test/workflow-verification');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
const nativeServer = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Native link probe</title>'); });
await new Promise(resolve => nativeServer.listen(0, '127.0.0.1', resolve));
const nativeUrl = 'http://127.0.0.1:' + nativeServer.address().port + '/';
const results = {};
async function install(page) {
    await page.evaluate(() => {
        window.__writes = []; window.__tabs = [];
        window.GM_getValue = (k, d) => d;
        window.GM_setValue = (...args) => window.__writes.push(args);
        window.GM_openInTab = url => window.__tabs.push(url);
    });
    await page.addScriptTag({ content: source });
}
async function idle(page) {
    await page.waitForFunction(() => document.querySelector('#zcw-doulist-sort').getAttribute('aria-busy') === 'false', { timeout: 120000 });
}
async function nativePopup(page, selector, modifier) {
    // 先核对真正目的地址；原生开页用本地快速HTTP页，避免第三方网络延迟影响Target可观察时机。
    const destination = await page.$eval(selector, n => n.href);
    await page.$eval(selector, (n, u) => { n.href = u; }, nativeUrl);
    const before = new Set(browser.targets());
    const opened = browser.waitForTarget(t => !before.has(t) && t.type() === 'page', { timeout: 10000 });
    if (modifier === 'Control') {
        await page.keyboard.down('Control');
        try { await page.click(selector); } finally { await page.keyboard.up('Control'); }
    } else await page.click(selector, { button: 'middle' });
    const target = await opened, popup = await target.page();
    await popup.waitForFunction(() => location.href !== 'about:blank', { timeout: 15000 });
    const url = popup.url(); await popup.close();
    await page.$eval(selector, (n, u) => { n.href = u; }, destination);
    assert.equal(new URL(url).origin, new URL(nativeUrl).origin);
    return { destination, nativePopup: 'local-http-verified' };
}
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto('https://www.douban.com/doulist/1180539/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await install(page);
    results.native = [];
    for (const [selector, modifier] of [['.zcw-search-btn', 'middle'], ['.zcw-bilibili-btn', 'Control'], ['.zcw-soquark-btn', 'middle']]) {
        results.native.push({ selector, modifier, url: await nativePopup(page, selector, modifier) });
    }
    assert.equal(await page.evaluate(() => window.__tabs.length), 0, '原生修饰键和中键不调用GM重复开页');
    await page.click('.zcw-keyword-edit');
    await page.click('[data-language=english]');
    assert.equal(await page.$eval('.zcw-keyword-editor input', n => n.value), 'The Thing');
    await (await page.$('.zcw-keyword-editor')).screenshot({ path: path.join(out, 'keyword-editor.png') });
    await page.click('.zcw-keyword-apply');
    results.english = await page.$$eval('.zcw-group:first-of-type > a', links => links.slice(0, 3).map(n => n.href));
    assert.equal(new URL(results.english[1]).searchParams.get('keyword'), 'The Thing');
    await page.click('.zcw-keyword-edit');
    await page.$eval('.zcw-keyword-editor input', n => { n.value = '自定义 Beta'; n.dispatchEvent(new Event('input')); });
    await page.click('.zcw-keyword-apply');
    assert.equal(await page.$eval('.zcw-bilibili-btn', n => new URL(n.href).searchParams.get('keyword')), '自定义 Beta');
    await page.focus('.zcw-soquark-btn'); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__tabs.length), 2, '键盘各开一次');
    for (const [name, value] of [['ratingMin', '8'], ['yearFrom', '2000'], ['yearTo', '2010']]) await page.type(`[name=${name}]`, value);
    await page.click('.zcw-filter-apply'); await idle(page);
    results.filter = await page.evaluate(() => {
        const all = [...document.querySelectorAll('.doulist-item')];
        const shown = all.filter(n => !n.hidden);
        const bad = shown.filter(n => { const m = window.__ZCW__.DoulistSort.readMeta(n); return !m.movie || m.rating < 8 || m.year < 2000 || m.year > 2010; });
        return { total: all.length, shown: shown.length, bad: bad.length, actuallyHidden: all.filter(n => n.hidden).every(n => getComputedStyle(n).display === 'none'), writes: window.__writes.length };
    });
    assert.equal(results.filter.total, 221); assert.ok(results.filter.shown > 0); assert.equal(results.filter.bad, 0);
    assert.equal(results.filter.actuallyHidden, true); assert.equal(results.filter.writes, 0);
    await page.select('#zcw-doulist-sort select', 'year-desc'); await idle(page);
    const years = await page.$$eval('.doulist-item', nodes => nodes.filter(n => !n.hidden).map(n => window.__ZCW__.DoulistSort.readMeta(n).year));
    assert.ok(years.every((n, i) => !i || years[i - 1] >= n));
    results.filter.sortPreserved = true;
    await page.$eval('#zcw-doulist-sort', n => n.scrollIntoView({ block: 'start' }));
    await (await page.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'filters-light.png') });
    await page.setViewport({ width: 390, height: 844 });
    await (await page.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'filters-narrow.png') });
    await page.setViewport({ width: 1280, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await (await page.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'filters-dark.png') });
    await page.click('.zcw-filter-clear');
    assert.equal(await page.$$eval('.doulist-item', nodes => nodes.filter(n => !n.hidden).length), 221);

    // 独立受控页面模拟第3页503，不向真实网站制造失败请求。
    const resumePage = await browser.newPage();
    const calls = []; let fail = true;
    const card = (id, rating) => `<div class="doulist-item" id="m${id}"><div class="title"><a href="https://movie.douban.com/subject/${id}/">测试${id} Test</a></div><span class="rating_nums">${rating}</span><div class="abstract">年份: 2000</div></div>`;
    const html = (id, rating, next) => `<html><body><div id="content"><div class="article">${card(id, rating)}<div class="paginator"><span data-total-page="3"></span>${next ? `<span class="next"><a href="?start=${next}">后页</a></span>` : ''}</div></div></div></body></html>`;
    await resumePage.setRequestInterception(true);
    resumePage.on('request', request => {
        const u = new URL(request.url());
        const start = Number(u.searchParams.get('start') || 0);
        if (start) calls.push(start);
        request.respond({ status: start === 50 && fail ? 503 : 200, contentType: 'text/html', body: start === 0 ? html(1, 5, 25) : start === 25 ? html(2, 8, 50) : html(3, 9, null) });
    });
    await resumePage.goto('https://www.douban.com/doulist/7654321/', { waitUntil: 'domcontentloaded' });
    await install(resumePage); await resumePage.select('#zcw-doulist-sort select', 'rating-desc'); await idle(resumePage);
    assert.equal(await resumePage.$$eval('.doulist-item', nodes => nodes.length), 1);
    await (await resumePage.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'resume-error.png') });
    fail = false; await resumePage.click('.zcw-load-resume'); await idle(resumePage);
    assert.deepEqual(calls, [25, 50, 50]);
    results.resume = { calls, order: await resumePage.$$eval('.doulist-item', nodes => nodes.map(n => n.id)) };
    assert.deepEqual(results.resume.order, ['m3', 'm2', 'm1']);
    await (await resumePage.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'resume-complete.png') });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); nativeServer.close(); }
