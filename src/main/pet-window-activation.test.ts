import assert from "node:assert/strict";
import test from "node:test";
import { activateMainWindowFromPal, PET_WORKSPACE_OPTIONS } from "./pet-window-activation";

function mainWindow({ visible = true, minimized = false, destroyed = false } = {}) {
  const actions: string[] = [];
  return {
    actions,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: () => { actions.push("restore"); visible = true; },
    show: () => { actions.push("show"); visible = true; },
    focus: () => { actions.push("focus"); },
  };
}

test("Pal overlay workspace options preserve the foreground app activation policy", () => {
  assert.equal(PET_WORKSPACE_OPTIONS.visibleOnFullScreen, true);
  assert.equal(PET_WORKSPACE_OPTIONS.skipTransformProcessType, true);
});

test("returning to a visible window activates the app before focusing, without re-showing it", () => {
  const window = mainWindow();
  activateMainWindowFromPal(window, () => window.actions.push("activate"));
  assert.deepEqual(window.actions, ["activate", "focus"]);
});

test("a minimized main window is restored before application activation", () => {
  const window = mainWindow({ minimized: true, visible: false });
  activateMainWindowFromPal(window, () => window.actions.push("activate"));
  assert.deepEqual(window.actions, ["restore", "activate", "focus"]);
});

test("a hidden main window is shown and a closed one is left alone", () => {
  const hidden = mainWindow({ visible: false });
  activateMainWindowFromPal(hidden, () => hidden.actions.push("activate"));
  assert.deepEqual(hidden.actions, ["activate", "show", "focus"]);
  const closed = mainWindow({ destroyed: true });
  activateMainWindowFromPal(closed, () => closed.actions.push("activate"));
  assert.deepEqual(closed.actions, []);
});
