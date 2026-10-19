import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowCompletedPetNotice } from "./pet-notice-visibility";

const panes = { main: { threadId: "main-chat" }, "side:1": { threadId: "side-chat" } };

test("focused visible chats do not trigger a Pal notice", () => {
  assert.equal(shouldShowCompletedPetNotice("main-chat", true, new Set(["main-chat"]), new Set(), panes), false);
  assert.equal(shouldShowCompletedPetNotice("tile-chat", true, new Set(["main-chat", "tile-chat"]), new Set(), panes), false);
  assert.equal(shouldShowCompletedPetNotice("side-chat", true, new Set(), new Set(["side:1"]), panes), false);
});

test("backgrounded app and other chats still trigger a Pal notice", () => {
  assert.equal(shouldShowCompletedPetNotice("tile-chat", false, new Set(["tile-chat"]), new Set(), panes), true);
  assert.equal(shouldShowCompletedPetNotice("other-chat", true, new Set(["tile-chat"]), new Set(), panes), true);
  assert.equal(shouldShowCompletedPetNotice("side-chat", true, new Set(), new Set(), panes), true);
});
