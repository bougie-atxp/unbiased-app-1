import assert from "node:assert/strict";
import test from "node:test";
import { completedWorkDuration } from "./work-duration";

test("completed visual-only answers still show their elapsed work duration", () => {
  assert.equal(completedWorkDuration(1_000, 46_000, true, false), 45);
});

test("tool turns retain their duration, but empty turns do not gain a row", () => {
  assert.equal(completedWorkDuration(1_000, 46_000, false, true), 45);
  assert.equal(completedWorkDuration(1_000, 46_000, false, false), undefined);
  assert.equal(completedWorkDuration(null, 46_000, true, false), null);
});
