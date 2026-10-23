import type { IpcMain } from "electron";
import type { BrowserRuntimeClient } from "./browser-runtime-client";

/** Keep the renderer's thread IDs and raw layout sizes out of the runtime protocol. */
export function registerBrowserMirrorIpc(
  ipc: Pick<IpcMain, "handle">,
  runtime: Pick<BrowserRuntimeClient, "request">,
  rootThreadOf: (threadId: string | null) => string,
) {
  const request = async (method: "view.start" | "view.stop" | "view.resize" | "view.input", params: Record<string, unknown>) => {
    try { return await runtime.request(method, params); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  };
  const dimension = (value: unknown, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(1, n)) : fallback;
  };
  const size = (p: { width?: unknown; height?: unknown; dpr?: unknown } | undefined) => ({
    width: dimension(p?.width, 800, 16384),
    height: dimension(p?.height, 600, 16384),
    dpr: dimension(p?.dpr, 1, 3),
  });
  ipc.handle("agentmirror:start", (_event, p) => request("view.start", {
    ...size(p), sessionId: rootThreadOf(p?.threadId ?? null),
  }));
  ipc.handle("agentmirror:stop", () => request("view.stop", {}));
  ipc.handle("agentmirror:resize", (_event, p) => request("view.resize", size(p)));
  ipc.handle("agentmirror:input", (_event, p) => request("view.input", p));
}
