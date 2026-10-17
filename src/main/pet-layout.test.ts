import assert from "node:assert/strict";
import test from "node:test";
import { clampPetPosition, petScale, petWindowSize, pointInPetWindow } from "./pet-layout";

test("pet scale accepts menu choices and rejects saved invalid values", () => {
  assert.equal(petScale(1.5), 1.5);
  assert.equal(petScale(3), 1);
  assert.equal(petScale("2"), 1);
});

test("pet window dimensions scale with the artwork", () => {
  assert.deepEqual(petWindowSize(1), { width: 112, height: 130 });
  assert.deepEqual(petWindowSize(2), { width: 224, height: 260 });
  assert.deepEqual(petWindowSize(0.75), { width: 84, height: 98 });
});

test("resized pet stays inside a display work area", () => {
  const area = { x: 100, y: 50, width: 400, height: 300 };
  assert.deepEqual(clampPetPosition({ x: 450, y: 290 }, petWindowSize(2), area), { x: 276, y: 90 });
  assert.deepEqual(clampPetPosition({ x: -20, y: -30 }, petWindowSize(1), area), { x: 100, y: 50 });
});

test("pet hover tracks the visible window bounds", () => {
  const bounds = { x: 200, y: 300, width: 112, height: 130 };
  assert.equal(pointInPetWindow({ x: 200, y: 300 }, bounds), true);
  assert.equal(pointInPetWindow({ x: 311, y: 429 }, bounds), true);
  assert.equal(pointInPetWindow({ x: 312, y: 400 }, bounds), false);
  assert.equal(pointInPetWindow({ x: 250, y: 430 }, bounds), false);
});
