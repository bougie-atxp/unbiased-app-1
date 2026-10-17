import assert from "node:assert/strict";
import test from "node:test";
import { parsePinnedThreads, togglePinnedThread } from "./sidebar-pins";

test("saved pins recover from malformed entries and duplicate IDs", () => {
  const saved = parsePinnedThreads(JSON.stringify([
    { id: "a", title: "First", inProject: false },
    { id: "a", title: "Duplicate", inProject: true },
    { id: "b", title: "Second", inProject: true },
    { id: 3, title: "Invalid", inProject: false },
  ]));
  assert.deepEqual(saved, [
    { id: "a", title: "First", inProject: false },
    { id: "b", title: "Second", inProject: true },
  ]);
  assert.deepEqual(parsePinnedThreads("not json"), []);
});

test("pinning puts the newest chat first and unpinning removes only that chat", () => {
  const first = { id: "a", title: "First", inProject: false };
  const second = { id: "b", title: "Second", inProject: true };
  assert.deepEqual(togglePinnedThread([first], second), [second, first]);
  assert.deepEqual(togglePinnedThread([second, first], second), [first]);
});
