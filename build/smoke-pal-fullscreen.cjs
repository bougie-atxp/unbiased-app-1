// Native macOS check: temporarily enters a fullscreen Space. Run manually on
// a desktop, not in headless CI. Uses the same activation code as Pal clicks.
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { app, BrowserWindow } = require("electron");
require("tsx/cjs");
const { activateMainWindowFromPal, PET_WORKSPACE_OPTIONS } = require("../src/main/pet-window-activation.ts");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fullscreen(win, enabled) {
  const transition = once(win, enabled ? "enter-full-screen" : "leave-full-screen");
  win.setFullScreen(enabled);
  await Promise.race([transition, pause(10000).then(() => { throw new Error("Fullscreen transition timed out"); })]);
  await pause(500);
  assert.equal(win.isFullScreen(), enabled);
}

async function main() {
  assert.equal(process.platform, "darwin", "This check needs macOS Spaces");
  await app.whenReady();
  const main = new BrowserWindow({ width: 1000, height: 700, title: "Pal fullscreen regression check" });
  const panels = [];
  try {
    await main.loadURL('data:text/html,<body style="background:%23141414;color:white;font:28px system-ui;padding:60px">Pal fullscreen regression check</body>');
    app.focus({ steal: true });
    main.show();
    main.focus();
    await pause(500);
    assert.equal(app.dock.isVisible(), true, "Precondition: regular foreground application");
    await fullscreen(main, true);
    const bounds = main.getBounds();
    // Both the Pal and its notification are created while the main window is
    // already fullscreen. Neither may change the app's activation policy.
    for (let i = 0; i < 2; i++) {
      const panel = new BrowserWindow({ width: 260, height: 100, type: "panel", frame: false,
        show: false, focusable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true });
      panels.push(panel);
      panel.setVisibleOnAllWorkspaces(true, PET_WORKSPACE_OPTIONS);
      await panel.loadURL('data:text/html,<body style="background:%23333;color:white">Pal notification test</body>');
      panel.showInactive();
      await pause(500);
      assert.equal(app.dock.isVisible(), true, "An overlay must not turn the application into an accessory app");
      assert.equal(panel.isFocusable(), false);
      panel.hide();
      activateMainWindowFromPal(main, () => app.focus({ steal: true }));
      await pause(500);
      assert.equal(main.isFullScreen(), true);
      assert.equal(main.isFocused(), true);
      assert.deepEqual(main.getBounds(), bounds);
    }
    console.log("Fullscreen overlay creation and return passed; Dock identity, focus and fullscreen bounds preserved");
    await fullscreen(main, false);
    main.hide();
    activateMainWindowFromPal(main, () => app.focus({ steal: true }));
    assert.equal(main.isVisible(), true);
    main.minimize();
    await pause(500);
    activateMainWindowFromPal(main, () => app.focus({ steal: true }));
    await pause(500);
    assert.equal(main.isMinimized(), false);
    assert.equal(main.isFocused(), true);
    console.log("Hidden and minimized window return passed");
  } finally {
    for (const panel of panels) panel.destroy();
    if (!main.isDestroyed()) main.destroy();
  }
}

main().then(() => app.quit()).catch((error) => { console.error(error); app.exit(1); });
