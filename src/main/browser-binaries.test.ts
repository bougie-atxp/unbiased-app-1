import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { agentBrowserCandidates, automationBrowserPaths } from "./browser-binaries";

test("packaged app prefers its bundled agent-browser over a global install", () => {
  const candidates = agentBrowserCandidates("/App/Contents/Resources", true, "/Users/test", "/usr/bin:/opt/homebrew/bin");
  assert.equal(candidates[0], "/App/Contents/Resources/browser/agent-browser");
  assert.ok(candidates.includes("/opt/homebrew/bin/agent-browser"));
});

test("development app uses installed agent-browser", () => {
  const candidates = agentBrowserCandidates("/App/Contents/Resources", false, "/Users/test", "/usr/bin");
  assert.equal(candidates[0], "/usr/bin/agent-browser");
  assert.ok(!candidates.some((path) => path.includes("/App/Contents/Resources")));
});

test("automation only resolves the app-owned browser and supervisor", () => {
  for (const packaged of [true, false]) {
    const paths = automationBrowserPaths("/App/Contents/Resources", packaged, "/checkout");
    assert.equal(paths.root, packaged ? "/App/Contents/Resources/browser" : "/checkout/build/browser-bundle");
    assert.equal(paths.executable, join(paths.root, "Unbiased Browser.app/Contents/MacOS/Google Chrome for Testing"));
    assert.equal(paths.supervisor, join(paths.root, "browser-supervisor"));
    assert.equal(paths.denyDirectLaunch, join(paths.root, "browser-no-direct-launch"));
  }
});
