import assert from "node:assert/strict";
import { test } from "node:test";
import { registerBrowserMirrorIpc } from "./browser-mirror-ipc";
import { validateRequest } from "../../build/browser-runtime/protocol";

test("desktop mirror IPC translates conversation IDs and transient pane sizes into valid runtime requests", async () => {
  const handlers = new Map<string, Function>();
  const calls: unknown[] = [];
  registerBrowserMirrorIpc({ handle: (name, handler) => { handlers.set(name, handler); } }, {
    request: async (method, params) => {
      validateRequest({ id: 1, method, params });
      calls.push({ method, params });
      return { ok: true };
    },
  }, thread => thread === "side-chat" ? "root-chat" : thread ?? "main");
  const invoke = (name: string, params?: unknown) => handlers.get(name)!(null, params);
  assert.deepEqual(await invoke("agentmirror:start", { threadId: "side-chat", width: 0, height: 0, dpr: 0.8 }), { ok: true });
  assert.deepEqual(calls[0], { method: "view.start", params: { sessionId: "root-chat", width: 800, height: 600, dpr: 1 } });
  await invoke("agentmirror:start", { width: 600, height: 800, dpr: 2 });
  assert.deepEqual(calls[1], { method: "view.start", params: { sessionId: "main", width: 600, height: 800, dpr: 2 } });
  await invoke("agentmirror:resize", { width: Infinity, height: NaN, dpr: Infinity });
  assert.deepEqual(calls[2], { method: "view.resize", params: { width: 800, height: 600, dpr: 1 } });
  await invoke("agentmirror:stop");
  assert.deepEqual(calls[3], { method: "view.stop", params: {} });
});

test("desktop mirror returns both synchronous and asynchronous runtime failures to the panel", async () => {
  for (const request of [() => { throw new Error("invalid request"); }, async () => { throw new Error("runtime stopped"); }]) {
    const handlers = new Map<string, Function>();
    registerBrowserMirrorIpc({ handle: (name, handler) => { handlers.set(name, handler); } }, { request }, thread => thread ?? "main");
    const result = await handlers.get("agentmirror:start")!(null, { threadId: "a", width: 800, height: 600, dpr: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error, /invalid request|runtime stopped/);
  }
});
