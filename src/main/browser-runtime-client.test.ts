import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserRuntimeClient } from "./browser-runtime-client";

const delay = (ms:number) => new Promise(done=>setTimeout(done,ms));
async function until(check:()=>boolean) {for(let i=0;i<100;i++){if(check())return;await delay(20);}assert.ok(check());}
test("runtime client matches replies, delivers events, rejects lost work and never replays it", async()=>{
  const dir=mkdtempSync(join(tmpdir(),"browser-rpc-client-"));
  const entry=join(dir,"server.cjs"), log=join(dir,"calls"), pid=join(dir,"pid");
  writeFileSync(entry, `
    const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pid)},String(process.pid));
    require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      const r=JSON.parse(line); const reply=result=>process.stdout.write(JSON.stringify({id:r.id,result})+'\\n');
      if(r.method==='initialize') reply({protocolVersion:1,runtimeVersion:'test',features:[],tools:[
        {type:'function',name:'browser_click',description:'',inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref']}},
        {type:'function',name:'future_browser_action',description:'',inputSchema:{type:'object',properties:{}}}
      ],platform:process.platform});
      else if(r.method==='tool.execute' && r.params.tool==='future_browser_action') reply({success:true,contentItems:[]});
      else if(r.method==='tool.execute') {fs.appendFileSync(${JSON.stringify(log)},'execute\\n');}
      else if(r.method==='view.start') {
        for(const sessionId of ['wrong-chat',r.params.sessionId])process.stdout.write(JSON.stringify({event:'agentmirror:frame',payload:{sessionId}})+'\\n');
        reply({ok:true});
      }
      else if(r.method==='shutdown') {reply({ok:true});setTimeout(()=>process.exit(0),10);}
      else {process.stdout.write(JSON.stringify({event:'agentmirror:state',payload:{connected:true}})+'\\n');setTimeout(()=>reply(r.params),r.params.delay||0);}
    }).on('close',()=>process.exit(0));
  `);
  const events:unknown[]=[];
  const client=new BrowserRuntimeClient({entry,executable:process.execPath,options:{browserRoot:dir,home:dir,tempDir:dir},onEvent:(_e,p)=>events.push(p)});
  try {
    await client.ready();
    assert.equal((await client.request("tool.execute",{tool:"future_browser_action",args:{},sessionId:"a"})).success,true,"the runtime catalog, not the client's built-in tool names, controls discovery");
    const [slow,fast]=await Promise.all([client.request("capabilities",{delay:50,value:"slow"}),client.request("capabilities",{delay:1,value:"fast"})]);
    assert.equal(slow.value,"slow");assert.equal(fast.value,"fast");assert.equal(events.length,2);
    await client.request("view.start",{sessionId:"chat-a",width:800,height:600,dpr:1});
    assert.equal(events.length,3);assert.deepEqual(events[2],{sessionId:"chat-a"},"frames from the previous chat must be ignored");
    await client.request("view.stop",{});
    const pending=client.request("tool.execute",{tool:"browser_click",args:{ref:"e1"},sessionId:"a"});
    const rejected=assert.rejects(pending,/exited/);
    await until(()=>{try{return readFileSync(log,"utf8").includes("execute");}catch{return false;}});
    process.kill(Number(readFileSync(pid,"utf8")),"SIGKILL"); await rejected;
    assert.equal(client.capabilities,null);await client.ready();
    assert.equal(readFileSync(log,"utf8"),"execute\n","a lost action must never be automatically replayed");
    await client.shutdown();await until(()=>!client.running);
  } finally {await client.shutdown();rmSync(dir,{recursive:true,force:true});}
});
test("runtime client rejects incompatible handshake and closes the child",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"browser-rpc-version-"));
  const entry=join(dir,"server.cjs");
  writeFileSync(entry,`require('node:readline').createInterface({input:process.stdin}).on('line',l=>process.stdout.write(JSON.stringify({id:JSON.parse(l).id,result:{protocolVersion:99,tools:[]}})+'\\n')).on('close',()=>process.exit(0));`);
  const client=new BrowserRuntimeClient({entry,executable:process.execPath,options:{browserRoot:dir,home:dir,tempDir:dir},onEvent:()=>{}});
  try {await assert.rejects(client.ready(),/Unsupported/);assert.equal(client.capabilities,null);assert.equal(client.running,false);}
  finally{await client.shutdown();rmSync(dir,{recursive:true,force:true});}
});
