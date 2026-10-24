// Isolated Chrome: SoQuark native switch controls with delayed Vue mount.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const source=fs.readFileSync(new URL('../douban-wish-to-zhongchuang.user.js',import.meta.url),'utf8');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const p=await browser.newPage();await p.setRequestInterception(true);
 p.on('request',r=>r.respond({contentType:'text/html',body:'<meta charset="utf-8"><div id="app"><a onclick="switchSource(0)">本地搜</a><a class="active" onclick="switchSource(1)">全网搜</a></div>'}));
 await p.goto('https://www.soquark.com/s/test.html#zcw-global');
 await p.evaluate(()=>{window.__calls=[];window.switchSource=n=>{window.__calls.push(n);document.querySelectorAll('a[onclick]').forEach(a=>a.classList.toggle('active',a.getAttribute('onclick')==='switchSource('+n+')'));};});
 await p.addScriptTag({content:source});
 await p.evaluate(()=>{switchSource(0);window.__calls=[];document.querySelector('#app').setAttribute('data-v-app','');});
 await p.waitForFunction(()=>document.querySelector('a[onclick="switchSource(1)"]').classList.contains('active'));
 assert.deepEqual(await p.evaluate(()=>window.__calls),[1]);
 await p.click('a[onclick="switchSource(0)"]');
 await new Promise(r=>setTimeout(r,350));
 assert.deepEqual(await p.evaluate(()=>window.__calls),[1,0]);
 assert.equal(await p.$eval('a[onclick="switchSource(0)"]',a=>a.classList.contains('active')),true);
 await p.goto('https://www.soquark.com/s/test.html');
 await p.evaluate(()=>{window.__calls=[];window.switchSource=n=>window.__calls.push(n);document.querySelector('#app').setAttribute('data-v-app','');});
 await p.addScriptTag({content:source});await new Promise(r=>setTimeout(r,250));
 assert.deepEqual(await p.evaluate(()=>window.__calls),[]);
 console.log('Chrome controlled: delayed mount -> global once; manual local preserved; unmarked page untouched.');
}finally{await browser.close();}
