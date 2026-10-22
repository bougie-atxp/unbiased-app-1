const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
require("tsx/cjs");
const { interactiveVisualDocument } = require("../src/shared/interactive-visual.ts");

async function main() {
  await app.whenReady();
  const source = '<style>.wrap{display:flex;flex-wrap:wrap;gap:8px}.tile{flex:0 0 180px;height:30px}</style>' +
    '<div style="height:300px"></div><div class="wrap"><div class="tile"></div><div class="tile"></div></div>';
  const visualUrl = `data:text/html;charset=utf-8,${encodeURIComponent(interactiveVisualDocument(source))}`;
  const page = `<!doctype html><html><body style="margin:0;background:#111">
    <script>
      window.heights = [];
      addEventListener('message', (event) => {
        if (event.source !== document.querySelector('iframe').contentWindow ||
            event.data?.type !== 'unbiased-visual-height') return;
        const height = event.data.height;
        window.heights.push(height);
        document.querySelector('iframe').style.height = height + 'px';
      });
    </script>
    <iframe sandbox="allow-scripts" style="display:block;width:400px;height:96px;border:0" src="${visualUrl}"></iframe>
  </body></html>`;
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { sandbox: true, nodeIntegration: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const before = await win.webContents.executeJavaScript("window.heights.length");
    await new Promise((resolve) => setTimeout(resolve, 700));
    const heights = await win.webContents.executeJavaScript("window.heights");
    assert.ok(heights.length > 0, "visual did not report its height");
    assert.ok(heights.length - before <= 1, `visual height kept oscillating: ${JSON.stringify(heights)}`);
    const frame = win.webContents.mainFrame.frames.find((child) => child !== win.webContents.mainFrame);
    assert.ok(frame, "visual iframe exists");
    const gutter = await frame.executeJavaScript("getComputedStyle(document.documentElement).scrollbarGutter");
    assert.equal(gutter, "stable");
    console.log("Visual iframe height settles without scrollbar-width feedback.");
  } finally {
    win.destroy();
    app.quit();
  }
}

main().catch((error) => { console.error(error); app.exit(1); });
