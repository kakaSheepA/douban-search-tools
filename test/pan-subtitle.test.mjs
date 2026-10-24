import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source = fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js', import.meta.url), 'utf8');
async function boot(t) {
    const dom = new JSDOM('<div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/1/">暗黑 第三季 Dark Season 3</a></div><div class="abstract">年份: 2020</div></div></div></div>', {url:'https://www.douban.com/doulist/123/', runScripts:'outside-only'});
    t.after(()=>dom.window.close()); const win=dom.window,tabs=[];
    win.GM_openInTab=u=>tabs.push(u); win.GM_getValue=(k,d)=>d;
    win.eval(source); await new Promise(r=>setTimeout(r,35));
    return {doc:win.document,win,tabs,Z:win.__ZCW__};
}
test('网盘与字幕地址中文优先，英文回退，保留字编码不改变URL结构', async t => {
    const {Z}=await boot(t);
    assert.equal(typeof Z.buildPansearchUrl,'function'); assert.equal(typeof Z.buildSubtitleUrl,'function');
    for(const [raw,expected] of [['怪形前传 The Thing','怪形前传'],['Spider-Man','Spider-Man'],["Who? What# / & Why'", "Who? What# / & Why'"]]) {
        const p=new URL(Z.buildPansearchUrl(raw,{literal:raw.includes('?')}));
        assert.equal(p.origin,'https://www.pansearch.me'); assert.equal(p.pathname,'/search'); assert.equal(p.searchParams.get('keyword'),expected); assert.equal(p.hash,'');
        const s=new URL(Z.buildSubtitleUrl(raw,{literal:raw.includes('?')}));
        assert.equal(s.origin,'https://subhd.me'); assert.equal(decodeURIComponent(s.pathname),'/search/'+expected); assert.equal(s.search,''); assert.equal(s.hash,'');
    }
    assert.equal(Z.buildPansearchUrl(''),null); assert.equal(Z.buildSubtitleUrl(null),null);
});
test('第四个网盘入口与更多字幕均为原生链接，同步年份季数，三站批量仍为原三站', async t => {
    const {doc,win,tabs}=await boot(t);
    assert.deepEqual([...doc.querySelectorAll('.zcw-group>a')].map(n=>n.textContent),['搜中创','搜B站','搜夸克','搜网盘']);
    doc.querySelector('.zcw-more-toggle').click();
    const pan=doc.querySelector('.zcw-pansearch-btn'),sub=doc.querySelector('.zcw-subtitle-link'); assert.ok(sub);
    for(const link of [pan,sub]) {
        assert.equal(link.tagName,'A'); assert.equal(link.target,'_blank');
        for(const opts of [{ctrlKey:true},{metaKey:true},{button:1}]){const e=new win.MouseEvent('click',{bubbles:true,cancelable:true,...opts});link.dispatchEvent(e);assert.equal(e.defaultPrevented,false);}
    }
    assert.equal(tabs.length,0);
    doc.querySelector('[data-zcw-action=year]').click();doc.querySelector('[data-zcw-action=season]').click();
    assert.equal(new URL(pan.href).searchParams.get('keyword'),'暗黑 2020');
    assert.equal(decodeURIComponent(new URL(sub.href).pathname),'/search/暗黑 2020');
    sub.click();assert.equal(tabs.length,1);tabs.length=0;
    const expected=[...doc.querySelectorAll('.zcw-group>a')].slice(0,3).map(n=>n.href);
    doc.querySelector('[data-zcw-action=all]').click();assert.deepEqual(tabs,expected);
});
