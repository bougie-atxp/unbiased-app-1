// Regression: optional nested-chat support must never gate local annotations.
// Bundles the real ChatPane with mocked IPC; no engine or external navigation.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=process.cwd();
const deadline=setTimeout(()=>{console.error('Transcript annotation regression timed out');app.exit(1)},30000);deadline.unref();
const bundleResult=build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ChatPane} from './src/renderer/src/App';
window.qaCalls=[];
window.unbiased=new Proxy({}, {get:(_,key)=>{
 if(String(key).startsWith('on'))return ()=>()=>{};
 return async(...args)=>{window.qaCalls.push([key,...args]);if(key==='contextUsage')return null;if(key==='mcpThreadGet')return {enabled:[]};if(key==='liveApprovals'||key==='liveUserInputs')return [];if(key==='fileExists')return {exists:false};if(key==='favicon')return {dataUrl:null};return {};};
}});
const entries=[{kind:'assistant',text:'Select this side chat excerpt.\\n\\nSee [example link](https://example.com/side-chat).'}];
const side={paneId:'side:qa',connected:true,canTypeToFocus:()=>false,reset:{entries,nonce:0},emptyState:null,accessMode:'untrusted',onAccessModeChange:()=>{},planMode:false,onTogglePlanMode:()=>{}};
const main={...side,paneId:'main',onAskSideChat:text=>window.qaCalls.push(['askSide',text])};
createRoot(document.getElementById('root')).render(<><section id="side"><ChatPane {...side}/></section><section id="main"><ChatPane {...main}/></section></>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.glob':'__qaGlob'},banner:{js:'var __qaGlob=()=>({});'},loader:{'.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'qa',setup(build){
 build.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 build.onLoad({filter:/\.md$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
 build.onLoad({filter:/\/src\/renderer\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport { ChatPane };',loader:'tsx'}));
}}]});
(async()=>{
 const bundle=(await bundleResult).outputFiles[0].text;
 await app.whenReady();const win=new BrowserWindow({show:false,width:1100,height:720,webPreferences:{backgroundThrottling:false}});
 const css=fs.readFileSync(root+'/src/renderer/src/transcript-action-dock.css','utf8')+fs.readFileSync(root+'/src/renderer/src/chat-link.css','utf8');
 const html=`<!doctype html><style>body{margin:0;background:#111;color:#eee;font:14px system-ui;--bg:#111;--fg:#eee;--fg-msg:#ddd;--panel:#222;--panel-2:#282828;--chip:#252525;--chip-raised:#333;--border:#333;--dim:#999;--accent:#FF7764;--font-ui:system-ui;--font-code:monospace}#root{display:flex;height:680px;gap:20px}section{display:flex;flex-direction:column;width:500px;height:650px;position:relative}${css}</style><div id="root"></div><script>${bundle.replaceAll('</script','<\\/script')}</script>`;
 fs.writeFileSync('/tmp/unbiased-side-annotation.html',html);await win.loadFile('/tmp/unbiased-side-annotation.html');
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await new Promise(r=>setTimeout(r,700));
 const select=async id=>{await win.webContents.executeJavaScript(`(()=>{const node=[...document.querySelectorAll('#${id} p')].find(p=>p.textContent==='Select this side chat excerpt.');if(!node)throw Error('Missing transcript paragraph');const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));};
 const pause=()=>new Promise(r=>setTimeout(r,100));
 const until=async(check,message)=>{
   for(let attempt=0;attempt<30;attempt++){if(await check())return;await pause();}
   const diagnostics=await win.webContents.executeJavaScript("({activeElement:document.activeElement?.outerHTML,mainText:document.querySelector('#main').innerText})");
   assert.fail(message+JSON.stringify(diagnostics));
 };
 const annotationCount=id=>win.webContents.executeJavaScript(`document.querySelectorAll('#${id} button[aria-label="Remove annotation"]').length`);
 const typeComment=async(id,text)=>{
   await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#${id} input[placeholder="Add an optional comment…"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await pause();
 };
 await select('side');
 const sideLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#side .transcript-action')].map(b=>b.textContent)");
 assert.deepEqual(sideLabels,['Add to chat']);
 await win.webContents.executeJavaScript("document.querySelector('#side .transcript-action').click()");
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#side input[placeholder=\"Add an optional comment…\"]')"),true);
 assert.equal(await annotationCount('side'),1,'Add to chat must attach the excerpt before confirming its comment');
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('#side button[aria-label=\"Send\"]').disabled"),false,'an excerpt alone is immediately sendable');
 if(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 await typeComment('side','Explain this selection');
 await win.webContents.executeJavaScript("document.querySelector('#side button[title=\"Add annotation\"]')?.click()");
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#side button[aria-label=\"Remove annotation\"]').length"),1,'confirmed text attaches to the side composer');
 await select('main');
 const mainLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#main .transcript-action')].map(b=>b.textContent)");assert.deepEqual(mainLabels,['Add to chat','Ask in side chat']);
 await win.webContents.executeJavaScript("[...document.querySelectorAll('#main .transcript-action')].find(b=>b.textContent==='Ask in side chat').click()");
 assert.equal(await win.webContents.executeJavaScript("window.qaCalls.filter(c=>c[0]==='askSide').at(-1)?.[1]"),'Select this side chat excerpt.');
 await win.webContents.executeJavaScript("document.querySelector('#side a[href]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
 await new Promise(r=>setTimeout(r,100));
 const linkLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#side .transcript-action')].map(b=>b.textContent)");
 assert.deepEqual(linkLabels,['Add to chat','Default browser']);
 await win.webContents.executeJavaScript("document.querySelector('#side .transcript-action').click()");
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#side button[aria-label=\"Remove annotation\"]').length"),2,'link attaches to the same side composer');
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#main button[aria-label=\"Remove annotation\"]').length"),0,'side annotations must not appear in main');
 // Confirmed annotations, including comments, reach the actual IPC boundary.
 await win.webContents.executeJavaScript("document.querySelector('#side button[aria-label=\"Send\"]').click()");
 await pause();
 const sentSide=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[1]==='side:qa')");
 assert.ok(sentSide,'side annotation message must be sent');
 assert.match(sentSide[2],/> Select this side chat excerpt\./);
 assert.match(sentSide[2],/Comment: Explain this selection/);
 assert.match(sentSide[2],/https:\/\/example\.com\/side-chat/);
 assert.equal(await annotationCount('side'),0);
 // Pending removal and Escape cancel only the in-progress attachment.
 await select('main');
 await win.webContents.executeJavaScript("document.querySelector('#main .transcript-action').click()");
 await pause();assert.equal(await annotationCount('main'),1);
 await win.webContents.executeJavaScript("document.querySelector('#main button[aria-label=\"Remove annotation\"]').click()");
 await pause();assert.equal(await annotationCount('main'),0);
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#main input[placeholder=\"Add an optional comment…\"]')"),false);
 await select('main');
 await win.webContents.executeJavaScript("document.querySelector('#main .transcript-action').click()");
 await until(()=>win.webContents.executeJavaScript("!!document.querySelector('#main input[placeholder=\"Add an optional comment…\"]')"),'comment editor must mount before Escape');
 await win.webContents.executeJavaScript("document.querySelector('#main input[placeholder=\"Add an optional comment…\"]').focus()");
 // Use browser keyboard input rather than an untrusted DOM KeyboardEvent.
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until(async()=>await annotationCount('main')===0,'Escape must remove the pending annotation');
 // Sending without the checkmark still includes the latest optional comment.
 await select('main');
 await win.webContents.executeJavaScript("document.querySelector('#main .transcript-action').click()");
 await typeComment('main','Comment still being edited');
 await win.webContents.executeJavaScript("document.querySelector('#main button[aria-label=\"Send\"]').click()");
 await pause();
 const sentMain=await win.webContents.executeJavaScript("window.qaCalls.find(c=>c[0]==='sendMessage'&&c[1]==='main')");
 assert.ok(sentMain,'pending annotation must be sendable before the checkmark');
 assert.match(sentMain[2],/Comment: Comment still being edited/);
 assert.equal(sentMain[2].split('> Select this side chat excerpt.').length-1,1,'confirmation/send must not duplicate the excerpt');
 assert.equal(await annotationCount('main'),0);
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#main input[placeholder=\"Add an optional comment…\"]')"),false,'sending closes the pending comment editor');
 console.log('PASS: real ChatPane attaches pending excerpts immediately, confirms without duplication, sends confirmed/pending comments, handles removal/Escape, and isolates side annotations.');win.destroy();app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
