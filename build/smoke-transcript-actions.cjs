// Regression: optional nested-chat support must never gate local annotations.
// Bundles the real ChatPane with mocked IPC; no engine or external navigation.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=process.cwd();
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
 await app.whenReady();const win=new BrowserWindow({show:false,width:1100,height:720});
 const css=fs.readFileSync(root+'/src/renderer/src/transcript-action-dock.css','utf8')+fs.readFileSync(root+'/src/renderer/src/chat-link.css','utf8');
 const html=`<!doctype html><style>body{margin:0;background:#111;color:#eee;font:14px system-ui;--bg:#111;--fg:#eee;--fg-msg:#ddd;--panel:#222;--panel-2:#282828;--chip:#252525;--chip-raised:#333;--border:#333;--dim:#999;--accent:#FF7764;--font-ui:system-ui;--font-code:monospace}#root{display:flex;height:680px;gap:20px}section{display:flex;flex-direction:column;width:500px;height:650px;position:relative}${css}</style><div id="root"></div><script>${bundle.replaceAll('</script','<\\/script')}</script>`;
 fs.writeFileSync('/tmp/unbiased-side-annotation.html',html);await win.loadFile('/tmp/unbiased-side-annotation.html');await new Promise(r=>setTimeout(r,700));
 const select=async id=>{await win.webContents.executeJavaScript(`(()=>{const node=[...document.querySelectorAll('#${id} p')].find(p=>p.textContent==='Select this side chat excerpt.');if(!node)throw Error('Missing transcript paragraph');const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));};
 await select('side');
 const sideLabels=await win.webContents.executeJavaScript("[...document.querySelectorAll('#side .transcript-action')].map(b=>b.textContent)");
 assert.deepEqual(sideLabels,['Add to chat']);
 await win.webContents.executeJavaScript("document.querySelector('#side .transcript-action').click()");
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#side input[placeholder=\"Add an optional comment…\"]')"),true);
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
 if(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT) fs.writeFileSync(process.env.UNBIASED_TRANSCRIPT_ACTIONS_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 console.log('PASS: actual ChatPane captures/attaches side-chat text and links without a nested-chat callback; annotations stay in the side composer; main chat retains both actions and side-chat dispatch.');win.destroy();app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
