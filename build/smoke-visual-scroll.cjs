const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { app, BrowserWindow } = require("electron");
require("tsx/cjs");
const { interactiveVisualDocument } = require("../src/shared/interactive-visual.ts");

async function main() {
  await app.whenReady();
  const css = readFileSync(require.resolve("../src/renderer/src/openui-visual.css"), "utf8");
  const visual = interactiveVisualDocument('<div style="height:2600px">Top<div id="bottom" style="position:absolute;top:2500px">Bottom</div></div>');
  const visualUrl = `data:text/html;charset=utf-8,${encodeURIComponent(visual)}`;
  const page = `<!doctype html><html><head><style>
    :root { --bg:#111; --fg-msg:#eee; --border:#444; --panel:#222; --font-ui:system-ui; }
    body { margin:0; height:100vh; background:#111; }
    ${css}
    .app-interactive-html-visual { width:100%; overflow:hidden; }
    iframe { display:block; width:100%; border:0; }
  </style></head><body><div class="app-generated-visual-viewport" id="viewport">
    <div class="app-generated-visual-viewport__toolbar">Controls</div>
    <div class="app-interactive-html-visual"><iframe id="frame" sandbox="allow-scripts" src="${visualUrl}"></iframe></div>
  </div><script>
    const viewport = document.getElementById('viewport');
    const frame = document.getElementById('frame');
    let height = 440;
    addEventListener('message', event => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      if (event.data?.type === 'unbiased-visual-height') {
        height = event.data.height;
        frame.style.height = (viewport.matches(':popover-open') ? height : Math.min(1600, height)) + 'px';
      } else if (event.data?.type === 'unbiased-visual-wheel') {
        viewport.scrollBy({ top: event.data.deltaY, behavior: 'instant' });
      } else if (event.data?.type === 'unbiased-visual-ready') {
        viewport.setAttribute('popover', 'auto');
        viewport.showPopover();
        frame.style.height = height + 'px';
        frame.contentWindow.postMessage({ type: 'unbiased-visual-expanded', expanded: true }, '*');
      }
    });
  </script></body></html>`;
  const win = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { sandbox: true, nodeIntegration: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
    await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('visual did not expand')), 4000);
      const check = () => {
        const viewport = document.getElementById('viewport');
        if (viewport.matches(':popover-open') && Number.parseInt(document.getElementById('frame').style.height, 10) > 2500) {
          clearTimeout(deadline); resolve();
        } else setTimeout(check, 20);
      };
      check();
    })`);
    const before = await win.webContents.executeJavaScript(`({
      viewportHeight: document.getElementById('viewport').clientHeight,
      contentHeight: document.getElementById('viewport').scrollHeight,
      frameHeight: document.getElementById('frame').getBoundingClientRect().height,
    })`);
    assert.ok(before.contentHeight > before.viewportHeight, JSON.stringify(before));
    assert.ok(before.frameHeight > 2500, JSON.stringify(before));

    const child = win.webContents.mainFrame.frames.find((frame) => frame !== win.webContents.mainFrame);
    assert.ok(child, "visual iframe exists");
    await child.executeJavaScript("document.body.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true, deltaY:500 }))");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const scrollTop = await win.webContents.executeJavaScript("document.getElementById('viewport').scrollTop");
    assert.ok(scrollTop > 0, `expanded viewport did not scroll: ${scrollTop}`);
    await child.executeJavaScript("document.body.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true, deltaY:10000 }))");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bottom = await win.webContents.executeJavaScript(`(() => {
      const viewport = document.getElementById('viewport');
      return { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight };
    })()`);
    assert.ok(bottom.max > 1000 && bottom.top >= bottom.max - 1, JSON.stringify(bottom));
    console.log("Expanded visual remains full height and wheel scrolling reaches the viewport in Electron.");
  } finally {
    win.destroy();
    app.quit();
  }
}

main().catch((error) => { console.error(error); app.exit(1); });
