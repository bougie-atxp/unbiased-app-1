import assert from "node:assert/strict";
import test from "node:test";
import { addMultiViewChat, multiViewColumns } from "./multi-view-layout";

test("one chat fills the view and more chats tile without unreadable columns", () => {
  assert.equal(multiViewColumns(1, 1600), 1);
  assert.equal(multiViewColumns(2, 1600), 2);
  assert.equal(multiViewColumns(4, 1600), 2);
  assert.equal(multiViewColumns(6, 1600), 3);
  assert.equal(multiViewColumns(6, 700), 1);
});

test("multi-view ignores duplicates and caps visible chats at six", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(addMultiViewChat(["a"], "a"), ["a"]);
  assert.deepEqual(addMultiViewChat(ids, "g"), ids);
  assert.deepEqual(addMultiViewChat(["a"], "b"), ["a", "b"]);
});
