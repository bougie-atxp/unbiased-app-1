import assert from "node:assert/strict";
import test from "node:test";
import { SideChatRecents, listVisibleThreads, parseSideChatRecords } from "./side-chat-recents";
import { SIDE_CHAT_RETAIN_MS } from "../shared/side-chat-retention";

const chat = (paneId: string, parentThreadId = "parent") => ({
  paneId,
  threadId: `thread-${paneId}`,
  parentThreadId,
  cwd: "/project",
  baselineTurns: 0,
  title: `Chat ${paneId}`,
});

test("closing a side chat retains it for two hours without extending a duplicate close", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"));
  assert.equal(recents.close("side:1", 100), true);
  assert.equal(recents.close("side:1", 200), false);
  assert.equal(recents.recent(200)[0].closedAt, 100);
  assert.deepEqual(recents.expired(100 + SIDE_CHAT_RETAIN_MS - 1), []);
  assert.deepEqual(recents.expired(100 + SIDE_CHAT_RETAIN_MS), ["side:1"]);
});

test("reopening requires the parent and resets the clock only on the next close", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"));
  recents.close("side:1", 100);
  assert.equal(recents.reopen("side:1", "other", 200), null);
  assert.equal(recents.reopen("side:1", "parent", 200)?.threadId, "thread-side:1");
  assert.deepEqual(recents.recent(200), []);
  assert.equal(recents.close("side:1", 300), true);
  assert.deepEqual(recents.expired(100 + SIDE_CHAT_RETAIN_MS), []);
  assert.deepEqual(recents.expired(300 + SIDE_CHAT_RETAIN_MS), ["side:1"]);
  assert.equal(recents.reopen("side:1", "parent", 300 + SIDE_CHAT_RETAIN_MS), null);
});

test("a side-thread notice resolves to its owning chat", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"));
  assert.equal(recents.forThread("thread-side:1")?.parentThreadId, "parent");
  assert.equal(recents.forThread("ordinary-thread"), undefined);
});

test("all closed chats remain recoverable during their two-hour window", () => {
  const recents = new SideChatRecents();
  for (let i = 0; i < 22; i++) {
    recents.register(chat(`side:${i}`));
    recents.close(`side:${i}`, i);
  }
  recents.register(chat("side:open"));
  assert.equal(recents.recent(22).length, 22);
  assert.equal(recents.reopen("side:0", "parent", 22)?.paneId, "side:0");
  recents.remove("side:0");
  assert.equal(recents.recent(22).some((record) => record.paneId === "side:0"), false);
});

test("a close during initial setup keeps its record and inherited-turn boundary", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"), 100);
  recents.close("side:1", 110);
  recents.setBaselineTurns("side:1", 3);
  assert.equal(recents.recent(120)[0].baselineTurns, 3);
  assert.equal(recents.recent(120)[0].closedAt, 110);
});

test("a persisted open chat becomes recoverable after a restart", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"), 100);
  recents.touchOpen(180);
  const restored = new SideChatRecents(parseSideChatRecords(recents.all(), 200));
  assert.equal(restored.recent(200)[0].closedAt, 180);
  assert.equal(restored.reopen("side:1", "parent", 250)?.threadId, "thread-side:1");
  restored.close("side:1", 300);
  assert.equal(restored.recent(300)[0].closedAt, 300);
});

test("restart keeps an already closed chat's original deadline", () => {
  const recents = new SideChatRecents();
  recents.register(chat("side:1"), 10);
  recents.close("side:1", 100);
  const restored = new SideChatRecents(parseSideChatRecords(recents.all(), 500));
  assert.equal(restored.recent(500)[0].closedAt, 100);
  assert.deepEqual(restored.recent(100 + SIDE_CHAT_RETAIN_MS), []);
});

test("malformed recovery rows cannot become recent side chats", () => {
  assert.deepEqual(parseSideChatRecords([{ ...chat("bad"), closedAt: 1, lastActiveAt: 1 }]), []);
  assert.deepEqual(parseSideChatRecords([{ ...chat("side:1"), closedAt: Infinity, lastActiveAt: 1 }]), []);
});

test("side threads cannot displace ordinary chats from the sidebar page", async () => {
  const pages = [
    { data: Array.from({ length: 100 }, (_, i) => ({ id: `side-${i}`, side: true })), nextCursor: "page-2" },
    { data: [{ id: "ordinary-1", side: false }, { id: "ordinary-2", side: false }], nextCursor: null },
  ];
  const seen: Array<string | null> = [];
  const threads = await listVisibleThreads(async (cursor) => {
    seen.push(cursor);
    return pages[cursor ? 1 : 0];
  }, (thread) => !thread.side, 2);
  assert.deepEqual(threads.map((thread) => thread.id), ["ordinary-1", "ordinary-2"]);
  assert.deepEqual(seen, [null, "page-2"]);
});
