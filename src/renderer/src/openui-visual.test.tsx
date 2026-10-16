import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { appOpenUILibrary, inspectOpenUI, visualFenceContent } from "./openui-visual";
import { openUIThemeStyle } from "./openui-theme";

test("registers the upstream OpenUI catalogue in the app's single renderer", () => {
  assert.ok(Object.keys(openuiLibrary.components).length > 50);
  for (const name of Object.keys(openuiLibrary.components)) assert.ok(appOpenUILibrary.components[name], name);
  for (const name of ["Whiteboard", "Mermaid", "VisualHtml"]) assert.ok(appOpenUILibrary.components[name]);
  assert.equal(appOpenUILibrary.components.GuidedExplainer, undefined);
});

test("OpenUI interaction and semantic states use host theme tokens", () => {
  const tokens = openUIThemeStyle as Record<string, string>;
  for (const key of [
    "--openui-background", "--openui-text-neutral-primary", "--openui-highlight",
    "--openui-text-accent-primary", "--openui-interactive-accent-disabled",
    "--openui-border-accent", "--openui-success-background", "--openui-danger-background",
    "--openui-info-background", "--openui-alert-background", "--openui-font-code",
  ]) {
    assert.ok(tokens[key], key);
    assert.doesNotMatch(tokens[key], /oklch|\bInter\b/, key);
  }
  const markup = renderToStaticMarkup(visualFenceContent("openui", 'root = Stack([TextContent("Themed")])', false)!);
  assert.match(markup, /--openui-interactive-accent-hover:color-mix\(in srgb, var\(--accent\)/);
});

test("validates complete programs and rejects unsupported or unsafe content", () => {
  assert.equal(inspectOpenUI('root = Stack([TextContent("Hello")])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Table([Col("Name", ["Ada"])])])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Tabs([TabItem("setup", "Setup", [TextContent("Place pieces")]), TabItem("move", "Move", [TextContent("Move diagonally")])])])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Mermaid("flowchart LR\\nA-->B")])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Unknown("oops")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("https://example.com")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("unfinished")').valid, false);
  assert.equal(inspectOpenUI("x".repeat(256_001)).valid, false);
  const board = 'root = Stack([Whiteboard("Graph", [{id:"a",type:"circle",x:1,y:1,width:40},{id:"b",type:"circle",x:100,y:1,width:40},{id:"e",type:"connector",from:"a",to:"b"}])])';
  assert.deepEqual(inspectOpenUI(board), { valid: true, selfFramed: true });
  assert.equal(inspectOpenUI(board.replace('to:"b"', 'to:"missing"')).valid, false);
  assert.equal(inspectOpenUI('root = Stack([GuidedExplainer("Journey")])').valid, false);
});

test("hides source while streaming and after validation failure", () => {
  const source = 'root = Stack([TextContent("private visual source")])';
  const pending = renderToStaticMarkup(visualFenceContent("openui", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /private visual source/);
  const failed = renderToStaticMarkup(visualFenceContent("openui", "root = Stack([", false)!);
  assert.match(failed, /couldn&#x27;t be displayed/);
  assert.equal(visualFenceContent("json", source, false), null);
  assert.ok(visualFenceContent("mermaid", "flowchart LR\nA-->B", false));
});

test("renders a standalone VisualHtml root without relaxing other OpenUI validation", () => {
  const html = '<div id="odyssey-map">Map</div><script>document.getElementById("odyssey-map").textContent="Ready"</script>';
  const source = `root = VisualHtml(${JSON.stringify(html)})`;
  assert.deepEqual(inspectOpenUI(source), { valid: false, reason: "parse" });
  const markup = renderToStaticMarkup(visualFenceContent("openui", source, false)!);
  assert.match(markup, /app-openui-visual--bare/);
  assert.match(markup, /aria-label="Expand visual"/);
  assert.doesNotMatch(markup, /couldn&#x27;t be displayed|odyssey-map/);

  const extraStatement = renderToStaticMarkup(visualFenceContent("openui", `${source}\nother = TextContent("extra")`, false)!);
  assert.match(extraStatement, /couldn&#x27;t be displayed/);
  const invalidFragment = renderToStaticMarkup(visualFenceContent("openui", `root = VisualHtml(${JSON.stringify('<html><body>Not a fragment</body></html>')})`, false)!);
  assert.match(invalidFragment, /couldn&#x27;t be displayed/);
});

test("renders a library component through OpenUI", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(visualFenceContent("openui", 'root = Stack([TextContent("Hello from OpenUI"), Table([Col("Name", ["Ada"]), Col("Role", ["Engineer"])])])', false)));
    assert.match(dom.window.document.body.textContent ?? "", /Hello from OpenUI/);
    assert.match(dom.window.document.body.textContent ?? "", /Engineer/);
    assert.ok(dom.window.document.querySelector("table"));
    assert.ok(dom.window.document.querySelector('[aria-label="Interactive visual"]'));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("routes standalone HTML through OpenUI into a sandboxed frame", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const source = '<button id="secret-source">Next</button><script>document.querySelector("button").onclick=()=>{}</script>';
  const pending = renderToStaticMarkup(visualFenceContent("visual-html", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /secret-source/);
  const root = createRoot(dom.window.document.getElementById("root")!);
  const host = dom.window.document.getElementById("root")!;
  for (const [name, value] of Object.entries({
    "--bg": "#ffffff", "--panel": "#f5f5f5", "--fg-msg": "#222222",
    "--dim": "#666666", "--accent": "#e0584a",
  })) host.style.setProperty(name, value);
  try {
    await act(async () => root.render(visualFenceContent("visual-html", source, false)));
    const frame = dom.window.document.querySelector("iframe");
    assert.ok(frame);
    assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
    assert.equal(frame.getAttribute("src"), "unbiased-visual://view/test-id");
    assert.doesNotMatch(dom.window.document.body.innerHTML, /secret-source/);
    const sent: unknown[] = [];
    frame.contentWindow!.postMessage = (data: unknown) => { sent.push(data); };
    await act(async () => frame.dispatchEvent(new dom.window.Event("load")));
    assert.deepEqual(sent.at(-1), {
      type: "unbiased-visual-theme",
      colors: { bg: "#f5f5f5", fg: "#222222", muted: "#666666", accent: "#e0584a" },
      scheme: "light",
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
