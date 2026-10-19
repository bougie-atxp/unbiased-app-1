const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { app, BrowserWindow, protocol } = require("electron");
require("tsx/cjs");
const {
  INTERACTIVE_VISUAL_SCHEME,
  INTERACTIVE_VISUAL_PREVIEW_URL,
  interactiveVisualPreviewCsp,
  interactiveVisualPreviewDocument,
} = require("../src/shared/interactive-visual.ts");

protocol.registerSchemesAsPrivileged([{ scheme: INTERACTIVE_VISUAL_SCHEME, privileges: { standard: true, secure: true } }]);

async function main() {
  await app.whenReady();
  protocol.handle(INTERACTIVE_VISUAL_SCHEME, (request) => {
    if (request.url !== INTERACTIVE_VISUAL_PREVIEW_URL) return new Response("Not found", { status: 404 });
    const nonce = randomBytes(16).toString("base64");
    return new Response(interactiveVisualPreviewDocument(nonce), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": interactiveVisualPreviewCsp(nonce) },
    });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, webSecurity: true } });
  win.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame && event.url !== INTERACTIVE_VISUAL_PREVIEW_URL) event.preventDefault();
  });
  try {
    await win.loadURL("data:text/html,<body></body>");
    const result = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.src = '${INTERACTIVE_VISUAL_PREVIEW_URL}';
      let blocked = true;
      const timer = setTimeout(() => reject(new Error('preview frame did not respond')), 4000);
      addEventListener('message', event => {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.type === 'unbiased-visual-preview-ready') {
          frame.contentWindow.postMessage({ type: 'unbiased-visual-preview',
            html: '<div style="height:80px">Visible</div><svg onload="parent.postMessage({type:\\'ran\\'}, \\'*\\')"></svg><script>parent.postMessage({type:"ran"}, "*")<\\/script>',
            css: 'div { color: red }', colors: {}, scheme: 'dark' }, '*');
        } else if (event.data?.type === 'ran') blocked = false;
        else if (event.data?.type === 'unbiased-visual-preview-height' && event.data.height >= 80) {
          setTimeout(() => { clearTimeout(timer); resolve({ blocked, height: event.data.height }); }, 100);
        }
      });
      document.body.append(frame);
    })`);
    assert.equal(result.blocked, true);
    assert.ok(result.height >= 80);
    console.log("Preview frame displayed content and blocked generated JavaScript in Electron.");
  } finally {
    win.destroy();
    app.quit();
  }
}

main().catch((error) => { console.error(error); app.exit(1); });
