/** 真实 Chromium 开发验证：三个搜索按钮、中文关键词、键盘与 SoQuark 跳转。
 * GM API 为模拟，不安装 Tampermonkey。
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const out = path.resolve('test/search-verification');
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto('https://www.douban.com/doulist/1180539/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => {
        window.__searchTabs = []; window.__searchWrites = [];
        const store = {};
        window.GM_getValue = (k, d) => store[k] ?? d;
        window.GM_setValue = (k, v) => { store[k] = v; window.__searchWrites.push([k, v]); };
        window.GM_listValues = () => Object.keys(store);
        window.GM_openInTab = (u, opts) => window.__searchTabs.push({ u, opts });
    });
    await page.addScriptTag({ content: fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8') });
    const before = await page.evaluate(() => ({
        raw: document.querySelector('.doulist-item .title > a').textContent.trim(),
        keyword: document.querySelector('.zcw-soquark-btn').getAttribute('data-zcw-title'),
        counts: ['.zcw-search-btn', '.zcw-bilibili-btn', '.zcw-soquark-btn'].map(s => document.querySelectorAll(s).length),
    }));
    assert.deepEqual(before.counts, [25, 25, 25]);
    assert.equal(before.keyword, '怪形前传');
    await page.click('.zcw-soquark-btn');
    await page.click('.zcw-bilibili-btn');
    const external = await page.evaluate(() => ({ tabs: window.__searchTabs.slice(), writes: window.__searchWrites.length }));
    assert.equal(external.writes, 0); assert.equal(external.tabs.length, 2);
    assert.equal(decodeURIComponent(new URL(external.tabs[0].u).pathname), '/s/怪形前传.html');
    assert.equal(new URL(external.tabs[1].u).searchParams.get('keyword'), '怪形前传');
    await page.focus('.zcw-soquark-btn');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    const keyboard = await page.evaluate(() => ({ tabs: window.__searchTabs.length, writes: window.__searchWrites.length }));
    assert.deepEqual(keyboard, { tabs: 4, writes: 0 });
    await page.click('.zcw-search-btn');
    const zc = await page.evaluate(() => ({ last: window.__searchTabs.at(-1).u, writes: window.__searchWrites.length,
        removedUI: !!document.querySelector('.zcw-status-label, .zcw-res-chip, .zcw-library-chip, #zcw-library, .zcw-panel') }));
    assert.equal(decodeURIComponent(new URL(zc.last).pathname), '/s/怪形前传/');
    assert.equal(new URL(zc.last).searchParams.has('zcw_id'), false);
    assert.equal(zc.writes, 0);
    assert.equal(zc.removedUI, false);
    await (await page.$('.doulist-item .title')).screenshot({ path: path.join(out, 'buttons-light.png') });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await (await page.$('.doulist-item .title')).screenshot({ path: path.join(out, 'buttons-dark.png') });
    const target = await browser.newPage();
    await target.goto(external.tabs[0].u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await target.addScriptTag({ content: source });
    await target.waitForFunction(() => document.querySelector('[data-v-app] a[onclick="switchSource(1)"]')?.classList.contains('active'), { timeout: 25000 });
    const destination = { url: target.url(), title: await target.title(), source: '全网搜' };
    assert.equal(new URL(destination.url).hostname, 'www.soquark.com');
    assert.equal(decodeURIComponent(new URL(destination.url).pathname), '/s/怪形前传.html');
    const results = { before, external, keyboard, zc, destination };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
