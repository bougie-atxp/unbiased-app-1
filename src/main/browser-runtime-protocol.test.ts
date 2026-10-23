import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRequest, PROTOCOL_VERSION } from "../browser-runtime/protocol";

test("runtime handshake requires a compatible protocol and absolute host-owned paths", () => {
  const options = { browserRoot:"/browser",home:"/home/test",tempDir:"/tmp" };
  assert.equal(validateRequest({id:1,method:"initialize",params:{protocolVersion:PROTOCOL_VERSION,options}}).method,"initialize");
  for(const params of [{protocolVersion:99,options},{protocolVersion:1,options:{...options,home:"relative"}},{protocolVersion:1,options:{...options,port:0}}]) {
    assert.throws(()=>validateRequest({id:1,method:"initialize",params}),/Invalid/);
  }
});
test("runtime accepts declared browser tools and refuses native/CLI/CDP escape hatches", () => {
  const execute = (tool:string,args:unknown) => validateRequest({id:1,method:"tool.execute",params:{tool,args,sessionId:"chat-a"}});
  execute("browser_open",{url:"https://example.com"});
  execute("browser_scroll",{direction:"down",pixels:200});
  for(const [tool,args] of [["exec",{command:"whoami"}],["browser_open",{url:22}],["browser_open",{url:"https://example.com",executable:"/bin/sh"}],["browser_open",{}],["browser_scroll",{pixels:Infinity}]]) {
    assert.throws(()=>execute(tool as string,args),/Invalid/);
  }
  assert.throws(()=>validateRequest({id:1,method:"cdp",params:{method:"Browser.close"}}),/unsupported/);
});
test("runtime validates normalized user input and viewport bounds", () => {
  validateRequest({id:1,method:"view.start",params:{sessionId:"chat-a",width:800,height:600,dpr:2}});
  validateRequest({id:2,method:"view.input",params:{kind:"text",text:"hello"}});
  for(const params of [{kind:"text",text:"x".repeat(1025)},{kind:"mouse",x:NaN,y:2,type:"mouseMoved",button:"left",clickCount:1},{kind:"key",type:"rawKeyDown",key:"a",code:"KeyA",keyCode:65,modifiers:32},{kind:"cdp",method:"Input.dispatchKeyEvent"}]) {
    assert.throws(()=>validateRequest({id:1,method:"view.input",params}),/Invalid/);
  }
  assert.throws(()=>validateRequest({id:1,method:"view.resize",params:{width:0,height:600,dpr:1}}),/Invalid/);
  assert.throws(()=>validateRequest({id:1,method:"session.release",params:{sessionId:null}}),/Invalid/);
});
