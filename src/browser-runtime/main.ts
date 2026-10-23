// Node-only JSONL entry point. No Electron, GUI, HTTP listener or cloud credentials.
import { createBrowserRuntime } from "./core";
import { MAX_REQUEST_BYTES, validateRequest, type RuntimeOptions } from "./protocol";

let runtime: ReturnType<typeof createBrowserRuntime> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let ending = false;
let frameBackpressure = false;
function write(message: unknown, frame = false) {
  if (frame && frameBackpressure) return;
  const ready = process.stdout.write(JSON.stringify(message) + "\n");
  if (frame && !ready) frameBackpressure = true;
}
process.stdout.on("drain", () => { frameBackpressure = false; });
async function finish() {
  if (ending) return;
  ending = true;
  const deadline = setTimeout(() => process.exit(1), 5000);
  await runtime?.shutdown().catch(() => undefined);
  clearTimeout(deadline);
  process.exit(0);
}
async function dispatch(value: unknown) {
  let id = (value as {id?: unknown})?.id;
  try {
    const r = validateRequest(value); id = r.id;
    if (ending) throw new Error("Browser runtime is shutting down");
    if (r.method === "initialize") {
      if (runtime) throw new Error("Runtime is already initialized");
      runtime = createBrowserRuntime(r.params.options as RuntimeOptions, (event, payload) => write({event, payload}, event === "agentmirror:frame"));
      write({id, result: runtime.capabilities()}); return;
    }
    if (!runtime) throw new Error("Initialize the browser runtime first");
    const methods = {
      capabilities: runtime.capabilities, "tool.execute": runtime.execute,
      "session.release": runtime.release, "session.reset": runtime.reset,
      "view.start": runtime.mirrorStart, "view.stop": runtime.mirrorStop,
      "view.resize": runtime.mirrorResize, "view.input": runtime.mirrorInput,
      shutdown: runtime.shutdown,
    };
    const result = await (methods[r.method] as (p: any) => unknown)(r.params);
    write({id, result});
    if (r.method === "shutdown") await finish();
  } catch (error) { write({id: typeof id === "number" ? id : null, error: error instanceof Error ? error.message : String(error)}); }
}
let buffered = "";
let queued = 0;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (data: string) => {
  buffered += data;
  if (Buffer.byteLength(buffered) > MAX_REQUEST_BYTES && !buffered.includes("\n")) { write({id:null,error:"Request too large"}); void finish(); return; }
  for (;;) {
    const newline = buffered.indexOf("\n"); if (newline < 0) break;
    const line = buffered.slice(0,newline); buffered = buffered.slice(newline+1);
    if (Buffer.byteLength(line) > MAX_REQUEST_BYTES || queued > 64) { write({id:null,error:"Request queue or size limit exceeded"}); void finish(); return; }
    let value: unknown;
    try { value = JSON.parse(line); } catch { write({id:null,error:"Invalid JSON"}); continue; }
    queued++;
    // Views stay responsive during a tool's navigation/wait. Tool/session
    // operations are serialized so tab selection and action stay atomic.
    if (String((value as any)?.method).startsWith("view.")) void dispatch(value).finally(() => queued--);
    else chain = chain.then(() => dispatch(value), () => dispatch(value)).finally(() => queued--);
  }
  if (Buffer.byteLength(buffered) > MAX_REQUEST_BYTES) { write({id:null,error:"Request too large"}); void finish(); }
});
process.stdin.on("end", () => void finish());
process.on("SIGTERM", () => void finish());
process.on("SIGINT", () => void finish());
process.stdout.on("error", () => void finish());
