/** 验证注入链接在豆瓣高优先级link/visited/hover规则下的实际可读性。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const out = path.resolve('test/contrast-verification');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
const html = `<html><head><meta charset="utf-8"><style>
body{font:14px Arial;background:#fff;color:#333;margin:24px}
.article{max-width:700px}.doulist-item{padding:20px;border:1px solid #ddd;background:#fff}
.doulist-item .title a:link,.doulist-item .title a:visited{color:#3377aa}
.doulist-item .title a:hover{color:#fff;background:#3377aa}
</style></head><body><div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/123/">黑星球 Dark Star</a></div><div class="rating">7.6</div><div class="abstract">年份: 1975</div></div></div></div></body></html>`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
const rows = [];
try {
    for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage();
        await page.setViewport({ width: 850, height: 350 });
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await page.setRequestInterception(true);
        page.on('request', r => r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
        await page.goto('https://www.douban.com/doulist/123/');
        await page.addScriptTag({ content: source });
        for (const selector of ['.zcw-bilibili-btn', '.zcw-soquark-btn']) for (const state of ['normal', 'hover', 'focus']) {
            await page.mouse.move(2, 2);
            await page.evaluate(() => document.activeElement?.blur());
            if (state === 'hover') await page.hover(selector);
            if (state === 'focus') await page.focus(selector);
            const result = await page.$eval(selector, el => {
                const rgba = value => { const v = value.match(/[\d.]+/g).map(Number); return [...v.slice(0, 3), v[3] ?? 1]; };
                const cs = getComputedStyle(el), color = rgba(cs.color);
                let bg = [255, 255, 255], node = el;
                const layers = [];
                while (node) { layers.push(rgba(getComputedStyle(node).backgroundColor)); node = node.parentElement; }
                for (const c of layers.reverse()) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
                const lum = rgb => rgb.slice(0, 3).map(n => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
                const a = lum(color), b = lum(bg);
                return { color: cs.color, background: cs.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), text: el.textContent };
            });
            rows.push({ scheme, selector, state, ...result });
        }
        await page.mouse.move(2, 2); await page.evaluate(() => document.activeElement?.blur());
        await (await page.$('.doulist-item')).screenshot({ path: path.join(out, `${scheme}.png`) });
        await page.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(rows, null, 2));
    console.log(JSON.stringify(rows.map(({ scheme, selector, state, contrast }) => ({ scheme, selector, state, contrast: +contrast.toFixed(2) })), null, 2));
    assert.ok(rows.every(r => r.contrast >= 4.5), '普通/悬停/聚焦在亮暗模式的文字对比度均应至少4.5:1');
} finally { await browser.close(); }
