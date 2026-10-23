import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MAX_RESPONSE_BYTES, PROTOCOL_VERSION, validateRequest, type Capabilities, type Method, type RuntimeEvent, type RuntimeOptions } from "../browser-runtime/protocol";

export class BrowserRuntimeClient {
  capabilities: Capabilities | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<Capabilities> | null = null;
  private desiredView: Record<string,unknown> | null = null;
  private nextId = 0;
  private pending = new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
  constructor(private config: {entry:string;options:RuntimeOptions;onEvent:(event:RuntimeEvent["event"],payload:any)=>void;executable?:string}) {}
  get running() { return this.child !== null; }
  get pid() { return this.child?.pid ?? null; }
  async ready(): Promise<Capabilities> {
    if(this.capabilities && this.child) return this.capabilities;
    if(this.starting) return this.starting;
    this.starting = this.start().finally(()=>{this.starting=null;}); return this.starting;
  }
  private async start(): Promise<Capabilities> {
    const child = spawn(this.config.executable ?? process.execPath,[this.config.entry],{
      env:{...process.env,ELECTRON_RUN_AS_NODE:"1"},stdio:["pipe","pipe","pipe"],detached:true,
    });
    this.child=child;
    let buffered="";
    const fail=(error:Error)=>{
      if(this.child!==child) return;
      this.child=null; this.capabilities=null;
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);} this.pending.clear();
      this.config.onEvent("agentmirror:state",{connected:false,reason:"runtime-stopped"});
    };
    child.on("error",fail); child.on("exit",()=>fail(new Error("Browser runtime exited")));
    child.stdin.on("error",fail);
    child.stderr.on("data", data=>console.warn("[browser-runtime]",String(data).slice(0,2000)));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",(data:string)=>{
      if(this.child!==child) return;
      buffered+=data;
      if(Buffer.byteLength(buffered)>MAX_RESPONSE_BYTES){child.kill();fail(new Error("Browser runtime response exceeded limit"));return;}
      for(;;){const n=buffered.indexOf("\n");if(n<0)break;const line=buffered.slice(0,n);buffered=buffered.slice(n+1);
        try {const m=JSON.parse(line);
          if(m.event && ["agentmirror:frame","agentmirror:state","agentmirror:activity"].includes(m.event)){
            if(m.event==="agentmirror:frame" && (!this.desiredView || m.payload?.sessionId!==this.desiredView.sessionId)) continue;
            this.config.onEvent(m.event,m.payload);continue;
          }
          const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);
          if(m.error)p.reject(new Error(m.error));else p.resolve(m.result);
        }catch{child.kill();fail(new Error("Invalid browser runtime response"));return;}
      }
    });
    try {
      const capabilities=await this.send("initialize",{protocolVersion:PROTOCOL_VERSION,options:this.config.options},10000) as Capabilities;
      if(capabilities.protocolVersion!==PROTOCOL_VERSION || !Array.isArray(capabilities.tools)) throw new Error("Unsupported browser runtime protocol");
      this.capabilities=capabilities;
      if(this.desiredView) await this.send("view.start",this.desiredView,5000);
      return capabilities;
    } catch(error) {child.stdin.end();fail(error instanceof Error ? error : new Error(String(error)));throw error;}
  }
  private send(method:Method,params:Record<string,unknown>,timeout=250000):Promise<any>{
    const child=this.child;if(!child)return Promise.reject(new Error("Browser runtime is not running"));
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Browser runtime ${method} timed out`));},timeout);
      this.pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+"\n");
    });
  }
  async request(method:Method,params:Record<string,unknown>){
    if(method!=="tool.execute") validateRequest({id:1,method,params});
    await this.ready();
    if(method==="tool.execute") validateRequest({id:1,method,params},this.capabilities!.tools);
    if(method==="view.start") this.desiredView=params;
    if(method==="view.resize" && this.desiredView) this.desiredView={...this.desiredView,...params};
    if(method==="view.stop" || method==="session.reset") this.desiredView=null;
    return this.send(method,params);
  }
  async shutdown():Promise<{ok:boolean}>{
    this.desiredView=null;
    if(!this.child)return {ok:true};
    const child=this.child;
    try{return await this.send("shutdown",{},4500);}catch{return {ok:false};}
    finally{child.stdin.end();}
  }
}
