// Exercise the public runtime interface from ordinary Node, without Electron.
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { mkdtempSync, readFileSync, rmSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync, spawn } = require("node:child_process");
require("tsx/cjs");
const { BrowserRuntimeClient } = require("../src/main/browser-runtime-client.ts");

const delay = ms => new Promise(done=>setTimeout(done,ms));
async function until(check) { for(let i=0;i<80;i++){if(await check())return;await delay(100);}throw new Error("Timed out waiting for runtime state"); }
function alive(pid) {try{return !execFileSync("ps",["-p",String(pid),"-o","stat="],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim().startsWith("Z");}catch{return false;}}
async function main() {
  const runtimeEntry=resolve(process.argv[3]??"out/main/browser-runtime.js");
  const home=mkdtempSync(join(tmpdir(),"unbiased-runtime-smoke-"));
  const cookies=new Map();
  const server=createServer((req,res)=>{
    cookies.set(req.url,req.headers.cookie??"");
    if(req.url==="/chat-a") res.setHeader("Set-Cookie","runtimeQA=preserved; Path=/; Max-Age=86400; HttpOnly");
    res.setHeader("Content-Type","text/html");
    res.end(`<!doctype html><title>${req.url}</title><h1>${req.url}</h1><label>Name<input aria-label="Name"></label><button onclick="this.textContent='Changed'">Change</button>`);
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const net=require("node:net");
  async function freePort(){const server=net.createServer();await new Promise(done=>server.listen(0,"127.0.0.1",done));const port=server.address().port;await new Promise(done=>server.close(done));return port;}
  const port=await freePort();
  const events=[];
  const client=new BrowserRuntimeClient({entry:runtimeEntry,executable:process.execPath,
    options:{browserRoot:resolve(process.argv[2]??"build/browser-bundle"),home,tempDir:home,osVersion:"13.0",port:port},
    onEvent:(event,payload)=>events.push({event,payload})});
  const tool=async(tool,args={},sessionId="chat-a")=>{
    const result=await client.request("tool.execute",{tool,args,sessionId});
    assert.equal(result.success,true,JSON.stringify(result));return result;
  };
  const content=r=>r.contentItems.map(i=>i.text??"").join("\n");
  let passed=false;
  try {
    const capabilities=await client.ready();
    assert.equal(capabilities.protocolVersion,1);
    assert.ok(capabilities.tools.some(t=>t.name==="browser_open"));
    const url=`http://127.0.0.1:${server.address().port}`;
    await tool("browser_open",{url:`${url}/chat-a`});
    await tool("browser_open",{url:`${url}/chat-b`},"chat-b");
    const snapshot=content(await tool("browser_snapshot"));
    assert.match(snapshot,/heading "\/chat-a"/);assert.doesNotMatch(snapshot,/heading "\/chat-b"/);
    const textbox=/textbox "Name" \[ref=(\w+)\]/.exec(snapshot)?.[1];assert.ok(textbox,snapshot);
    await tool("browser_click",{ref:textbox});
    await client.request("view.start",{width:800,height:600,dpr:1,sessionId:"chat-a"});
    await until(()=>events.some(e=>e.event==="agentmirror:frame"));
    const frame=events.find(e=>e.event==="agentmirror:frame").payload;
    assert.equal(frame.sessionId,"chat-a");assert.match(frame.src,/^data:image\/jpeg;base64,/);assert.ok(frame.width>0);
    await client.request("view.input",{kind:"text",text:"Typed through the runtime"});
    assert.match(content(await tool("browser_snapshot")),/Typed through the runtime/);
    await client.request("view.resize",{width:900,height:600,dpr:1});
    const shot=await tool("browser_screenshot");assert.match(shot.contentItems[0].imageUrl,/^data:image\/png;base64,/);
    await assert.rejects(client.request("view.input",{kind:"cdp",method:"Browser.close"}),/Invalid/);
    await assert.rejects(client.request("tool.execute",{tool:"exec",args:{command:"whoami"},sessionId:"chat-a"}),/unsupported/);
    await assert.rejects(client.request("view.resize",{width:-1,height:600,dpr:1}),/Invalid/);
    await client.request("view.stop",{});
    await client.request("session.release",{sessionId:"chat-b"});
    await client.request("view.start",{width:800,height:600,dpr:1,sessionId:"chat-a"});
    const record=join(home,".unbiased","automation-browser.pid");
    const pid=Number(readFileSync(record,"utf8").split(" ")[0]);
    // Kill the standalone runtime itself: the native guardian must clean up.
    process.kill(client.pid,"SIGKILL");await until(()=>!client.running);
    await until(()=>!alive(pid));
    assert.equal(client.capabilities,null);
    events.length=0;
    await client.ready();
    await tool("browser_open",{url:`${url}/restarted`});
    await until(()=>events.some(e=>e.event==="agentmirror:frame" && e.payload.sessionId==="chat-a"));
    assert.match(content(await tool("browser_snapshot")),/heading "\/restarted"/);

    await tool("browser_open",{url:`${url}/chat-a`});
    await tool("browser_open",{url:`${url}/chat-b`},"chat-b");
    assert.match(cookies.get("/chat-b")??"",/runtimeQA=preserved/);
    const stopped=await client.shutdown();assert.equal(stopped.ok,true);
    await until(()=>!client.running);
    assert.equal(existsSync(record),false);
    await client.ready();
    await tool("browser_open",{url:`${url}/persisted`});
    assert.match(cookies.get("/persisted")??"",/runtimeQA=preserved/,"website cookies should survive a graceful runtime shutdown");
    await client.shutdown();await until(()=>!client.running);
    // Simulate the desktop/engine host dying while the runtime is healthy.
    const ownerHome=mkdtempSync(join(home,"owner-"));
    const ownerOptions={browserRoot:resolve(process.argv[2]??"build/browser-bundle"),home:ownerHome,tempDir:ownerHome,osVersion:"13.0",port:await freePort()};
    const ownerCode=`require(${JSON.stringify(require.resolve("tsx/cjs"))});
      const {BrowserRuntimeClient}=require(${JSON.stringify(resolve("src/main/browser-runtime-client.ts"))});
      const c=new BrowserRuntimeClient({entry:${JSON.stringify(runtimeEntry)},executable:process.execPath,options:${JSON.stringify(ownerOptions)},onEvent:()=>{}});
      c.request('tool.execute',{tool:'browser_open',args:{url:${JSON.stringify(url+"/owner-death")}},sessionId:'owner-chat'}).then(r=>{if(!r.success)throw new Error(JSON.stringify(r));process.stdout.write(JSON.stringify({runtime:c.pid})+'\\n');}).catch(e=>{console.error(e);process.exit(1)});`;
    const owner=spawn(process.execPath,["-e",ownerCode],{stdio:["ignore","pipe","inherit"]});
    let ownerInfo="";owner.stdout.on("data",data=>{ownerInfo+=String(data);});
    try {
      await until(()=>ownerInfo.includes("\n"));
      const runtimePID=JSON.parse(ownerInfo.trim()).runtime;
      const browserPID=Number(readFileSync(join(ownerHome,".unbiased","automation-browser.pid"),"utf8").split(" ")[0]);
      process.kill(owner.pid,"SIGKILL");
      await until(()=>!alive(runtimePID) && !alive(browserPID));
    } finally {if(owner.exitCode===null && owner.signalCode===null)owner.kill("SIGKILL");}
    passed=true;
    console.log("Standalone Node runtime passed: discovery, two-session tab isolation, snapshots, input, JPEG streaming, resize, screenshots, invalid-command refusal, runtime SIGKILL cleanup, restart and host-death cleanup.");
  } finally {
    await client.shutdown();await new Promise(done=>server.close(done));if(passed)rmSync(home,{recursive:true,force:true});else console.error("QA profile retained for diagnosis:",home);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
