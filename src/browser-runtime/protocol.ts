import { isAbsolute } from "node:path";
import { AGENT_BROWSER_TOOLS } from "./tools";

export const PROTOCOL_VERSION = 1;
export const MAX_REQUEST_BYTES = 128 * 1024;
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
export type RuntimeOptions = { browserRoot: string; home: string; tempDir: string; osVersion?: string; port?: number; headed?: boolean };
export type ToolResult = { success: boolean; contentItems: ({ type: "inputText"; text: string } | { type: "inputImage"; imageUrl: string })[] };
export type RuntimeEvent = { event: "agentmirror:frame" | "agentmirror:state" | "agentmirror:activity"; payload: unknown };
export type Capabilities = { protocolVersion: number; runtimeVersion: string; tools: typeof AGENT_BROWSER_TOOLS; features: string[]; platform: string };
export type Method = "initialize" | "capabilities" | "tool.execute" | "session.release" | "session.reset" | "view.start" | "view.stop" | "view.resize" | "view.input" | "shutdown";
export type Request = { id: number; method: Method; params: Record<string, unknown> };
export function validateRequest(value: unknown, toolCatalog = AGENT_BROWSER_TOOLS): Request {
  const r = value as Request;
  if (!r || !Number.isSafeInteger(r.id) || r.id < 1 || !r.params || typeof r.params !== "object" || Array.isArray(r.params)) throw new Error("Invalid request envelope");
  const p = r.params;
  const string = (v: unknown, max = 8192) => typeof v === "string" && v.length <= max;
  const session = (nullable: boolean) => (nullable && p.sessionId === null) || (string(p.sessionId, 512) && (p.sessionId as string).length > 0);
  const number = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const viewport = () => number(p.width, 1, 16384) && number(p.height, 1, 16384) && number(p.dpr, 1, 3);
  let valid = false;
  switch (r.method) {
    case "initialize": {
      const o = p.options as RuntimeOptions;
      valid = p.protocolVersion === PROTOCOL_VERSION && !!o && [o.browserRoot, o.home, o.tempDir].every(v => string(v) && isAbsolute(v)) &&
        (o.port === undefined || (Number.isInteger(o.port) && o.port > 0 && o.port < 65536)) &&
        (o.osVersion === undefined || string(o.osVersion, 64)) && (o.headed === undefined || typeof o.headed === "boolean");
      break;
    }
    case "tool.execute": {
      const tool = toolCatalog.find(t => t.name === p.tool);
      const args = p.args as Record<string, unknown>;
      valid = !!tool && session(true) && !!args && typeof args === "object" && !Array.isArray(args);
      if (valid && tool) {
        const schema = tool.inputSchema as { required?: string[]; properties: Record<string, {type: string} | undefined> };
        valid = (schema.required ?? []).every(key => key in args) && Object.entries(args).every(([key, v]) => {
          const expected = schema.properties[key]?.type;
          return expected === "string" ? string(v, 60000) : expected === "number" ? number(v, -1000000, 1000000) : false;
        });
      }
      break;
    }
    case "session.release": valid = !!session(false); break;
    case "view.start": valid = viewport() && !!session(true); break;
    case "view.resize": valid = viewport(); break;
    case "view.input": {
      const modifier = p.modifiers === undefined || (Number.isInteger(p.modifiers) && number(p.modifiers, 0, 15));
      const point = () => number(p.x, -16384, 16384) && number(p.y, -16384, 16384);
      valid = p.kind === "text" ? string(p.text, 1024)
        : p.kind === "wheel" ? point() && modifier && number(p.deltaX, -100000, 100000) && number(p.deltaY, -100000, 100000)
        : p.kind === "mouse" ? point() && modifier && ["mousePressed", "mouseReleased", "mouseMoved"].includes(String(p.type)) && ["left", "middle", "right", "none"].includes(String(p.button)) && Number.isInteger(p.clickCount) && number(p.clickCount, 0, 3)
        : p.kind === "key" ? ["rawKeyDown", "keyUp"].includes(String(p.type)) && modifier && string(p.key, 128) && string(p.code, 128) && Number.isInteger(p.keyCode) && number(p.keyCode, 0, 65535) && (p.text === undefined || string(p.text, 1024)) : false;
      break;
    }
    case "capabilities": case "session.reset": case "view.stop": case "shutdown": valid = true; break;
  }
  if (!valid) throw new Error(`Invalid or unsupported browser operation: ${String(r.method)}`);
  return r;
}
