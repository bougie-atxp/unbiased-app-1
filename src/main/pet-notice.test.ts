import assert from "node:assert/strict";
import test from "node:test";
import { PET_NOTICE_DURATION_MS, latestPetResponse, petNoticePosition, petNoticeStackBounds, petResponseFirstLine } from "./pet-notice";

test("notice stays above the Pal or moves below near the top edge", () => {
  const area = { x: 0, y: 20, width: 800, height: 600 };
  assert.deepEqual(petNoticePosition({ x: 680, y: 400, width: 112, height: 130 }, area), { x: 464, y: 316 });
  assert.deepEqual(petNoticePosition({ x: 10, y: 30, width: 112, height: 130 }, area), { x: 0, y: 168 });
});

test("completion notice remains visible for 30 seconds", () => {
  assert.equal(PET_NOTICE_DURATION_MS, 30_000);
});

test("multiple notices stack above or below the Pal without replacing the first", () => {
  const area = { x: 0, y: 20, width: 800, height: 600 };
  assert.deepEqual(petNoticeStackBounds({ x: 680, y: 400, width: 112, height: 130 }, area, 2),
    { x: 464, y: 232, width: 336, height: 160 });
  assert.deepEqual(petNoticeStackBounds({ x: 10, y: 30, width: 112, height: 130 }, area, 2),
    { x: 0, y: 168, width: 336, height: 160 });
});

test("a long stack stays within the available screen area", () => {
  const area = { x: 0, y: 20, width: 800, height: 600 };
  const stack = petNoticeStackBounds({ x: 680, y: 400, width: 112, height: 130 }, area, 20);
  assert.deepEqual(stack, { x: 464, y: 20, width: 336, height: 372 });
});

test("uses the first nonempty response line and an ellipsis", () => {
  assert.equal(petResponseFirstLine("\n# Finished the update\nMore detail"), "Finished the update…");
  assert.equal(petResponseFirstLine(""), "Response completed");
});

test("prefers the final answer over commentary and supports assistant messages", () => {
  assert.equal(latestPetResponse([
    { type: "agentMessage", phase: "commentary", text: "Working on it" },
    { type: "agentMessage", phase: "final_answer", text: "Finished the task" },
  ]), "Finished the task");
  assert.equal(latestPetResponse([
    { type: "message", role: "user", text: "Question" },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer" }] },
  ]), "Answer");
});
