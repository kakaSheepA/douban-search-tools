// Isolated Chrome verification, never accesses the installed Tampermonkey extension.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
const out = new URL('./more-verification/', import.meta.url); fs.mkdirSync(out, { recursive: true });
try {
    const page = await browser.newPage();
    await browser.defaultBrowserContext().overridePermissions('https://www.douban.com', ['clipboard-read', 'clipboard-write']);
    await page.setRequestInterception(true);
    page.on('request', r => r.respond({ contentType: 'text/html', body: '<meta charset="utf-8"><div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/123/">暗黑 第三季 Dark Season 3</a></div><div class="abstract">年份: 2020</div></div></div></div>' }));
    await page.goto('https://www.douban.com/doulist/123/');
    await page.evaluate(() => {
        window.__tabs = []; window.__siteSettings = [];
        window.GM_openInTab = u => window.__tabs.push(u);
        window.GM_getValue = (k, d) => k === 'zcw.searchSites.v1' ? window.__siteSettings : d;
        window.GM_setValue = (k, v) => { if (k !== 'zcw.searchSites.v1') throw Error('Unexpected key'); window.__siteSettings = v; };
    });
    await page.addScriptTag({ content: source });
    await page.click('.zcw-more-toggle');
    await page.click('[data-zcw-action=copy]');
    await page.waitForFunction(() => document.querySelector('.zcw-more-status').textContent === '已复制片名');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '暗黑 第三季');
    await page.click('[data-zcw-action=year]'); await page.click('[data-zcw-action=season]');
    assert.equal(await page.$eval('.zcw-bilibili-btn', n => new URL(n.href).searchParams.get('keyword')), '暗黑 2020');
    assert.equal(await page.$eval('.zcw-imdb-link', n => new URL(n.href).searchParams.get('q')), '暗黑 2020');
    assert.equal(await page.$eval('.zcw-tmdb-link', n => new URL(n.href).searchParams.get('query')), '暗黑 2020');
    for (const theme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
        for (const width of [1280, 390]) {
            await page.setViewport({ width, height: 700 });
            await page.waitForFunction(() => { const r = document.querySelector('.zcw-more-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
            const rect = await page.$eval('.zcw-more-menu', n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; });
            assert.ok(rect.left >= 0 && rect.right <= width && rect.bottom <= 700);
            await page.screenshot({ path: fileURLToPath(new URL(`${theme}-${width}.png`, out)) });
        }
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.zcw-more-menu'), null);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'zcw-more-toggle');
    await page.click('.zcw-more-toggle'); await page.click('[data-zcw-action=all]');
    assert.equal(await page.evaluate(() => window.__tabs.length), 3);
    await page.click('.zcw-more-toggle'); await page.click('[data-zcw-action=settings]');
    await page.type('[name=siteName]', '测试搜索站');
    await page.type('[name=siteTemplate]', 'https://example.com/search?q={q}');
    await page.click('.zcw-site-add');
    for (const theme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
        for (const width of [1280, 390]) {
            await page.setViewport({ width, height: 700 });
            const rect = await page.$eval('.zcw-site-settings', n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
            assert.ok(rect.left >= 0 && rect.right <= width && rect.top >= 0 && rect.bottom <= 700);
            await page.screenshot({ path: fileURLToPath(new URL(`settings-${theme}-${width}.png`, out)) });
        }
    }
    // Tab is contained in the modal; Escape cancels without saving.
    await page.focus('.zcw-site-cancel'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.type), 'checkbox');
    await page.click('.zcw-site-save');
    assert.equal(await page.$('.zcw-site-settings'), null);
    const saved = await page.evaluate(() => window.__siteSettings);
    assert.equal(saved[0].name, '测试搜索站');
    await page.click('.zcw-more-toggle');
    assert.equal(await page.$eval('.zcw-custom-link', n => new URL(n.href).searchParams.get('q')), '暗黑 2020');
    await page.click('.zcw-custom-link');
    assert.match(await page.evaluate(() => window.__tabs.at(-1)), /^https:\/\/example.com\/search\?q=/);
    // Simulate a new userscript page with only the GM settings carried over.
    await page.reload();
    await page.evaluate(saved => {
        window.GM_getValue = () => saved; window.GM_setValue = () => {}; window.GM_openInTab = () => {};
    }, saved);
    await page.addScriptTag({ content: source }); await page.click('.zcw-more-toggle');
    assert.equal(await page.$eval('.zcw-custom-link', n => n.textContent), '测试搜索站');
    assert.equal(await page.$eval('.zcw-custom-link', n => new URL(n.href).searchParams.get('q')), '暗黑 第三季');
    console.log('Chrome: clipboard, IMDb/TMDB fallback, custom sites/save/reload, composed links, three searches, keyboard, light/dark/narrow layouts passed');
} finally { await browser.close(); }
