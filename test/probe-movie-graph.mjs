// Controlled Chrome probe using explicit fixture data and mocked GM transport.
// Does not bypass Douban verification or access the installed extension.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const out = new URL('./graph-verification/', import.meta.url); fs.mkdirSync(out, { recursive: true });
const movie = id => `<meta charset="utf-8"><div id="content"><div class="article"><h1><span property="v:itemreviewed">示例电影${id}</span><span class="year">(2020)</span></h1><div id="info"><a rel="v:directedBy" href="/celebrity/11/">示例导演</a> / <a rel="v:starring" href="https://www.douban.com/personage/22/">示例演员</a></div><div id="recommendations">${[2,3,4,5].filter(n => n !== id).map(n => `<dl><dd><a href="/subject/${n}/">示例电影${n}</a></dd></dl>`).join('')}</div></div></div>`;
const person = '<div id="content"><div class="article"><h1>示例演员</h1><div id="recent_movies"><a href="https://movie.douban.com/subject/1/">示例电影1</a><a href="https://movie.douban.com/subject/6/">示例电影6</a><a href="https://movie.douban.com/subject/7/">示例电影7</a></div></div></div>';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
try {
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 960 });
    await page.setRequestInterception(true); page.on('request', r => r.respond({ contentType: 'text/html', body: movie(1) }));
    await page.goto('https://movie.douban.com/subject/1/');
    await page.evaluate((person) => {
        window.__calls = []; window.__aborts = 0; window.__mode = 'ok'; window.__writes = [];
        window.GM_getValue = (k,d) => d; window.GM_setValue = (...a) => window.__writes.push(a); window.GM_openInTab = () => {};
        window.GM_xmlhttpRequest = opts => {
            window.__calls.push(opts.url);
            const timer = setTimeout(() => {
                if (window.__mode === 'captcha') opts.onload({ status: 200, finalUrl: 'https://sec.douban.com/c', responseText: '<title>验证</title>' });
                else opts.onload({ status: 200, finalUrl: opts.url, responseText: person });
            }, window.__mode === 'slow' ? 10000 : 10);
            return { abort: () => { clearTimeout(timer); window.__aborts++; opts.onabort?.(); } };
        };
    }, person);
    await page.addScriptTag({ content: source });
    const open = async () => { await page.click('.zcw-more-toggle'); await page.click('[data-zcw-action=graph]'); };
    await open(); await page.waitForFunction(() => window.__ZCW__.MovieGraph.snapshot().nodes.length === 7);
    assert.equal(await page.evaluate(() => window.__calls.length), 0, 'Current subject uses current DOM');
    await page.click('.zcw-graph-node[aria-label="示例演员"]', { count: 2, delay: 70 });
    assert.equal(await page.$eval('.zcw-graph-detail h2', n => n.textContent), '示例演员');
    await page.waitForFunction(() => window.__ZCW__.MovieGraph.snapshot().nodes.some(n => n.id === 'movie:7'));
    assert.equal(await page.evaluate(() => window.__calls.length), 1);
    const world = () => page.$eval('.zcw-graph-svg > g', n => n.getAttribute('transform'));
    const before = await world(); await page.click('[data-graph-tool=in]'); const zoomed = await world(); assert.notEqual(zoomed, before);
    const svg = await page.$('.zcw-graph-svg'), bounds = await svg.boundingBox();
    await page.mouse.move(bounds.x + 30, bounds.y + bounds.height - 60); await page.mouse.down(); await page.mouse.move(bounds.x + 160, bounds.y + bounds.height - 90); await page.mouse.up();
    const moved = await world(); assert.notEqual(moved, zoomed);
    await page.mouse.wheel({ deltaY: -120 }); await new Promise(r => setTimeout(r, 50)); assert.notEqual(await world(), moved);
    await page.click('[data-graph-tool=fit]');
    for (const theme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
        for (const width of [1440, 390]) {
            await page.setViewport({ width, height: width === 390 ? 844 : 960 });
            assert.equal(await page.evaluate(() => document.querySelector('.zcw-graph').scrollWidth <= innerWidth), true);
            const overlap = await page.evaluate(() => { const a=document.querySelector('.zcw-graph-side').getBoundingClientRect(), b=document.querySelector('.zcw-graph footer').getBoundingClientRect(); return a.bottom > b.top + 1; });
            assert.equal(overlap, false);
            await page.screenshot({ path: fileURLToPath(new URL(`${theme}-${width}.png`, out)) });
        }
    }
    await page.focus('.zcw-graph-close'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.zcw-graph')), true);
    await page.keyboard.press('Escape'); assert.equal(await page.$('.zcw-graph'), null);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'zcw-more-toggle');
    await open(); await page.evaluate(() => window.__mode = 'captcha');
    await page.click('[data-graph-node="person:personage:22"]'); await page.click('.zcw-graph-expand');
    await page.waitForFunction(() => /验证/.test(document.querySelector('.zcw-graph-status').textContent));
    await page.screenshot({ path: fileURLToPath(new URL('captcha.png', out)) });
    await page.evaluate(() => window.__mode = 'slow'); await page.click('.zcw-graph-expand'); await page.click('.zcw-graph-close');
    assert.equal(await page.evaluate(() => window.__aborts), 1);
    assert.equal(await page.evaluate(() => window.__writes.length), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    console.log('Chrome graph: current DOM, person expansion, native SVG selection, pan/zoom/fit, responsive themes, focus/Escape, captcha and cancellation passed; mocked transport, not live Douban data.');
} finally { await browser.close(); }
