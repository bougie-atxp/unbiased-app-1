import assert from "node:assert/strict";
import test from "node:test";
import { findSpriteFrames, petAnimationRow } from "./pet-frames";

test("skips transparent sprite cells, including gaps between frames", () => {
  const width = 16;
  const height = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of [[0, 0], [4, 1], [14, 3]]) {
    pixels[(y * width + x) * 4 + 3] = 255;
  }

  assert.deepEqual(findSpriteFrames(pixels, width, height, 2), [
    [0, 2],
    [7],
  ]);
});

test("falls back to the first cell for an empty row", () => {
  assert.deepEqual(findSpriteFrames(new Uint8ClampedArray(8 * 4), 8, 1, 1), [[0]]);
});

test("selects locomotion and activity rows", () => {
  assert.equal(petAnimationRow("idle", false, "right"), 1);
  assert.equal(petAnimationRow("working", false, "left"), 2);
  assert.equal(petAnimationRow("idle", false, "up"), 4);
  assert.equal(petAnimationRow("idle", false, "down"), 6);
  assert.equal(petAnimationRow("working", false, null), 7);
  assert.equal(petAnimationRow("working", true, null), 8);
  assert.equal(petAnimationRow("done", false, null), 3);
  assert.equal(petAnimationRow("failed", false, null), 5);
});
