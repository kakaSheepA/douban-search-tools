/** 真实浏览器开发验证（模拟 GM API，不安装或改动 Tampermonkey）。
 * node test/probe-doulist-live.mjs [片单URL]
 * 可用 CHROME_PATH 指定 Chromium/Chrome/Edge。
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://www.douban.com/doulist/1180539/';
const executablePath = process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const out = path.resolve('test/doulist-verification');
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => {
        window.__verifyWrites = [];
        window.GM_getValue = (k, d) => d;
        window.GM_setValue = (...args) => window.__verifyWrites.push(args);
        window.GM_listValues = () => [];
        window.GM_openInTab = () => {};
        window.__verifyPages = [];
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const response = await nativeFetch(...args);
            const html = await response.clone().text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            window.__verifyPages.push({ url: String(args[0]), status: response.status,
                count: doc.querySelectorAll('#content .article .doulist-item').length,
                ids: [...doc.querySelectorAll('#content .article .doulist-item')].map(n => n.id) });
            return response;
        };
    });
    await page.addScriptTag({ content: fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8') });
    await page.waitForSelector('#zcw-doulist-sort');
    const before = await page.evaluate(() => ({
        count: document.querySelectorAll('.doulist-item').length,
        ids: [...document.querySelectorAll('.doulist-item')].map(n => n.id),
        total: document.querySelector('.doulist-filter .active')?.textContent,
        pages: document.querySelector('[data-total-page]')?.getAttribute('data-total-page'),
    }));
    await page.select('#zcw-doulist-sort select', 'year-asc');
    await page.click('#zcw-doulist-sort button');
    await page.waitForFunction(() => document.querySelector('#zcw-doulist-sort').getAttribute('aria-busy') === 'false');
    assert.equal(await page.$$eval('.doulist-item', nodes => nodes.length), before.count, '取消加载保留原列表');
    await page.select('#zcw-doulist-sort select', 'rating-desc');
    await page.waitForFunction(() => document.querySelector('#zcw-doulist-sort').getAttribute('aria-busy') === 'false', { timeout: 120000 });
    const fetched = await page.evaluate(() => window.__verifyPages);
    const results = { url, before, fetched, cancelVerified: true, modes: [] };
    for (const mode of ['rating-desc', 'rating-asc', 'year-desc', 'year-asc', 'original']) {
        await page.select('#zcw-doulist-sort select', mode);
        const result = await page.evaluate(mode => {
            const nodes = [...document.querySelectorAll('.doulist-item')];
            const values = nodes.map(n => ({ id: n.id, ...window.__ZCW__.DoulistSort.readMeta(n) })).filter(n => n.movie);
            const field = mode.startsWith('rating') ? 'rating' : 'year';
            const known = values.map(n => n[field]).filter(n => n !== null);
            const ascending = mode.endsWith('-asc');
            const sorted = mode === 'original' || known.every((v, i) => !i || (ascending ? known[i - 1] <= v : known[i - 1] >= v));
            return { mode, count: nodes.length, movieCount: values.length, sorted, ids: nodes.map(n => n.id),
                top: values.slice(0, 5), searchButtons: document.querySelectorAll('.zcw-search-btn').length,
                biliButtons: document.querySelectorAll('.zcw-bilibili-btn').length,
                message: document.querySelector('#zcw-doulist-sort [role=status]').textContent,
                writes: window.__verifyWrites.length, paginatorHidden: document.querySelector('.paginator')?.hidden };
        }, mode);
        results.modes.push(result);
        fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
        assert.equal(result.sorted, true);
        assert.equal(result.writes, 0);
        assert.equal(result.paginatorHidden, true, result.message);
        assert.equal(result.searchButtons, result.movieCount);
        assert.equal(result.biliButtons, result.movieCount);
        assert.equal(fetched.length + 1, Number(before.pages), '实际读取全部分页');
        assert.equal(result.count, before.count + fetched.reduce((sum, p) => sum + p.count, 0), '全量条目应等于各源页面可见条目之和');
        if (mode === 'original') assert.deepEqual(result.ids, before.ids.concat(fetched.flatMap(p => p.ids)));
        if (mode === 'rating-desc') {
            await page.$eval('#zcw-doulist-sort', el => el.scrollIntoView({ block: 'start' }));
            await page.screenshot({ path: path.join(out, 'rating-desc.png') });
            await (await page.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'toolbar.png') });
        }
    }
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await (await page.$('#zcw-doulist-sort')).screenshot({ path: path.join(out, 'dark.png') });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ url, sourcePages: fetched.length + 1, sourceCounts: [before.count, ...fetched.map(p => p.count)], cancelVerified: true,
        modes: results.modes.map(({ mode, count, sorted, writes, searchButtons, biliButtons }) => ({ mode, count, sorted, writes, searchButtons, biliButtons })) }, null, 2));
} finally { await browser.close(); }
