import assert from "node:assert/strict";
import test from "node:test";
import { initialNavigationHistory, navigationTarget, pushNavigation, replaceNavigation } from "./navigation-history";

test("navigation history supports back, forward, and a new branch", () => {
  const first = pushNavigation(initialNavigationHistory, { kind: "thread", id: "a" });
  const second = pushNavigation(first, { kind: "scheduled" });
  assert.deepEqual(navigationTarget(second, -1), { kind: "thread", id: "a" });
  assert.equal(navigationTarget(second, 1), null);

  const back = { ...second, index: 1 };
  assert.deepEqual(navigationTarget(back, 1), { kind: "scheduled" });
  const branched = pushNavigation(back, { kind: "connectors" });
  assert.equal(navigationTarget(branched, 1), null);
  assert.deepEqual(branched.entries.map((entry) => entry.kind), ["home", "thread", "connectors"]);
});

test("starting a thread replaces its empty chat and repeat visits are ignored", () => {
  const project = pushNavigation(initialNavigationHistory, { kind: "project", path: "/repo", name: "Repo" });
  const thread = replaceNavigation(project, { kind: "thread", id: "a" });
  assert.deepEqual(navigationTarget(thread, -1), { kind: "home" });
  assert.equal(pushNavigation(thread, { kind: "thread", id: "a" }), thread);
});
