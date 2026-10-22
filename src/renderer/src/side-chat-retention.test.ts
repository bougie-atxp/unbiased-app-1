import assert from "node:assert/strict";
import test from "node:test";
import { SIDE_CHAT_RETAIN_MS, sideChatRecoveryDuration } from "../../shared/side-chat-retention";

test("side chat recovery duration counts down in hours and minutes", () => {
  assert.equal(sideChatRecoveryDuration(100, 100), "02h 00m");
  assert.equal(sideChatRecoveryDuration(101, 100), "02h 00m");
  assert.equal(sideChatRecoveryDuration(100, 100 + 61_000), "01h 59m");
  assert.equal(sideChatRecoveryDuration(100, 100 + SIDE_CHAT_RETAIN_MS - 1), "00h 01m");
  assert.equal(sideChatRecoveryDuration(100, 100 + SIDE_CHAT_RETAIN_MS), "00h 00m");
});
