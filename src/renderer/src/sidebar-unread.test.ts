import assert from "node:assert/strict";
import test from "node:test";
import { parseUnreadCompletedThreads, setThreadUnread, unreadAfterThreadActivity } from "./sidebar-unread";

test("unread completion markers survive storage and reject malformed IDs", () => {
  assert.deepEqual([...parseUnreadCompletedThreads('["a","a",3,"b"]')], ["a", "b"]);
  assert.deepEqual([...parseUnreadCompletedThreads("bad json")], []);
});

test("completion marks a chat unread until it is viewed", () => {
  const unread = setThreadUnread(new Set<string>(), "chat-a", true);
  assert.deepEqual([...unread], ["chat-a"]);
  assert.equal(setThreadUnread(unread, "chat-a", true), unread);
  assert.deepEqual([...setThreadUnread(unread, "chat-a", false)], []);
});

test("only the latest 100 unread completions are kept", () => {
  let unread: ReadonlySet<string> = new Set();
  for (let index = 0; index < 101; index++) unread = setThreadUnread(unread, `chat-${index}`, true);
  assert.equal(unread.size, 100);
  assert.equal(unread.has("chat-0"), false);
  assert.equal(unread.has("chat-100"), true);
});

test("only completed turns outside the visible focused chat become unread", () => {
  const empty = new Set<string>();
  const running = unreadAfterThreadActivity(empty, { threadId: "a", running: true }, new Set(), false);
  const failed = unreadAfterThreadActivity(empty, { threadId: "a", running: false, completed: false }, new Set(), false);
  assert.equal(running, empty);
  assert.equal(failed, empty);
  const background = unreadAfterThreadActivity(empty, { threadId: "a", running: false, completed: true }, new Set(["b"]), true);
  assert.equal(background.has("a"), true);
  const unfocused = unreadAfterThreadActivity(empty, { threadId: "a", running: false, completed: true }, new Set(["a"]), false);
  assert.equal(unfocused.has("a"), true);
  const viewed = unreadAfterThreadActivity(background, { threadId: "a", running: false, completed: true }, new Set(["a", "b"]), true);
  assert.equal(viewed.has("a"), false);
  const visibleTile = unreadAfterThreadActivity(empty, { threadId: "b", running: false, completed: true }, new Set(["a", "b"]), true);
  assert.equal(visibleTile.has("b"), false);
});
