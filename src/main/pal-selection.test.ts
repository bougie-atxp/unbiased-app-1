import assert from "node:assert/strict";
import test from "node:test";
import { savedPalSelection } from "./pal-selection";

test("Robot Head is the default Pal", () => {
  assert.equal(savedPalSelection({}), "robot");
  assert.equal(savedPalSelection({ folder: "/old/pals/custom" }), "robot");
  assert.equal(savedPalSelection({ selection: "unknown" }), "robot");
});

test("the user's Original Pal choice survives legacy preference migration", () => {
  assert.equal(savedPalSelection({ selection: "original" }), "original");
  assert.equal(savedPalSelection({ folder: "default" }), "original");
});
