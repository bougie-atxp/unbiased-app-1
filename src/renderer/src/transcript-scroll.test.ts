import { test } from "node:test";
import assert from "node:assert/strict";
import { isTranscriptAtBottom, settleTranscriptBottom, showScrollToLatest, transcriptScrollAfter } from "./transcript-scroll";

test("transcript follows at the bottom, including fractional scroll positions", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 500 }), true);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 498.5 }), true);
});

test("scrolling up pauses following until the reader returns to the bottom", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 497 }), false);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1200, clientHeight: 500, scrollTop: 497 }), false);
  assert.equal(isTranscriptAtBottom({ scrollHeight: 1200, clientHeight: 500, scrollTop: 700 }), true);
});

test("a transcript too short to scroll is already at the bottom", () => {
  assert.equal(isTranscriptAtBottom({ scrollHeight: 300, clientHeight: 500, scrollTop: 0 }), true);
});

test("new content does not cancel explicit follow while the list measures its height", () => {
  const following = { following: true, atBottom: true };
  const measuring = transcriptScrollAfter(following, { type: "bottom-change", atBottom: false });
  assert.equal(measuring.following, true);
  assert.equal(showScrollToLatest(measuring), false);
  assert.equal(transcriptScrollAfter(measuring, { type: "bottom-change", atBottom: true }).following, true);
});

test("final layout alignment closes a measured gap without moving a paused reader", () => {
  const scroller = { scrollHeight: 2875, clientHeight: 948, scrollTop: 1867 };
  settleTranscriptBottom({ following: true, atBottom: false }, scroller);
  assert.equal(scroller.scrollTop, 1927);
  scroller.scrollTop = 1700;
  settleTranscriptBottom({ following: false, atBottom: false }, scroller);
  assert.equal(scroller.scrollTop, 1700);
});

test("alignment does not write again for a fractional bottom offset", () => {
  let top = 498.5;
  let writes = 0;
  const scroller = {
    scrollHeight: 1000,
    clientHeight: 500,
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = value; writes++; },
  };
  settleTranscriptBottom({ following: true, atBottom: true }, scroller);
  assert.equal(writes, 0);
  top = 497;
  settleTranscriptBottom({ following: true, atBottom: false }, scroller);
  assert.equal(top, 500);
  assert.equal(writes, 1);
});

test("user scroll pauses following until send or jump explicitly resumes it", () => {
  const paused = transcriptScrollAfter({ following: true, atBottom: true }, { type: "user-scroll-up" });
  assert.equal(paused.following, false);
  assert.equal(showScrollToLatest(paused), true);
  const atBottom = transcriptScrollAfter(paused, { type: "bottom-change", atBottom: true });
  assert.equal(atBottom.following, false);
  assert.equal(showScrollToLatest(atBottom), false);
  assert.equal(transcriptScrollAfter(atBottom, { type: "follow" }).following, true);
});
