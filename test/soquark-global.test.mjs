import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source=fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js',import.meta.url),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(t,{hash='#zcw-global',mounted=true,active=false,url,html}={}) {
    const dom=new JSDOM(html||`<div id="app" ${mounted?'data-v-app':''}><a onclick="switchSource(0)" class="${active?'':'active'}">本地搜</a><a onclick="switchSource(1)" class="${active?'active':''}">全网搜</a></div>`,{url:url||'https://www.soquark.com/s/test.html'+hash,runScripts:'outside-only'});
    t.after(()=>dom.window.close());const win=dom.window,doc=win.document,clicks=[],storage=[];
    for(const name of ['GM_getValue','GM_setValue'])win[name]=(...args)=>storage.push(args);
    doc.querySelector('a[onclick="switchSource(1)"]')?.addEventListener('click',()=>{clicks.push(1);doc.querySelector('a[onclick="switchSource(0)"]').classList.remove('active');doc.querySelector('a[onclick="switchSource(1)"]').classList.add('active');});
    win.eval(source);await wait(10);return{win,doc,clicks,storage};
}
test('SoQuark链接携带全网搜标记，原生复制/中键和批量均保留意图',async t=>{
    const {win,doc}=await boot(t,{url:'https://www.douban.com/doulist/123/',html:'<div id="content"><div class="article"><div class="doulist-item"><div class="title"><a href="https://movie.douban.com/subject/1/">怪形前传 The Thing</a></div></div></div></div>'});
    const Z=win.__ZCW__,link=doc.querySelector('.zcw-soquark-btn');assert.ok(link);
    assert.equal(new URL(link.href).hash,'#zcw-global');
    assert.equal(new URL(Z.buildSoquarkSearchUrl('电影 2020',{literal:true})).hash,'#zcw-global');
});
test('等待Vue初始化后只切换一次，随后手动改本地不被强制改回',async t=>{
    const {doc,clicks,storage}=await boot(t,{mounted:false});
    assert.deepEqual(clicks,[]);doc.querySelector('#app').setAttribute('data-v-app','');await wait(15);
    assert.deepEqual(clicks,[1]);
    doc.querySelector('a[onclick="switchSource(1)"]').classList.remove('active');
    doc.querySelector('a[onclick="switchSource(0)"]').classList.add('active');await wait(230);
    assert.deepEqual(clicks,[1]);assert.deepEqual(storage,[]);assert.equal(doc.querySelector('.zcw-group'),null);
});
test('全网已选中不重复触发；未带标记或不在搜索页时完全不干预',async t=>{
    for(const args of [{active:true},{hash:''},{url:'https://www.soquark.com/#zcw-global'},{url:'https://evil.test/s/a.html#zcw-global'}]) {
        const {clicks,storage}=await boot(t,args);await wait(30);assert.deepEqual(clicks,[]);assert.deepEqual(storage,[]);
    }
});
