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
    await page.evaluate(() => { window.__tabs = []; window.GM_openInTab = u => window.__tabs.push(u); });
    await page.addScriptTag({ content: source });
    await page.click('.zcw-more-toggle');
    await page.click('[data-zcw-action=copy]');
    await page.waitForFunction(() => document.querySelector('.zcw-more-status').textContent === '已复制片名');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '暗黑 第三季');
    await page.click('[data-zcw-action=year]'); await page.click('[data-zcw-action=season]');
    assert.equal(await page.$eval('.zcw-bilibili-btn', n => new URL(n.href).searchParams.get('keyword')), '暗黑 2020');
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
    console.log('Chrome: clipboard, composed links, three searches, Escape focus, light/dark and narrow layout passed');
} finally { await browser.close(); }
