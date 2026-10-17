import assert from "node:assert/strict";
import test from "node:test";
import { palShapeFor, ROBOT_PALS } from "../shared/pals";
import { savedPalSelection } from "./pal-selection";

test("Robot Head is the default Pal", () => {
  assert.equal(savedPalSelection({}), "robot");
  assert.equal(savedPalSelection({ folder: "/old/pals/custom" }), "robot");
  assert.equal(savedPalSelection({ selection: "unknown" }), "robot");
});

test("removed and legacy Pal choices migrate to Robot Head", () => {
  assert.equal(savedPalSelection({ selection: "original" }), "robot");
  assert.equal(savedPalSelection({ folder: "default" }), "robot");
});

test("each Robot Head shape survives preference loading", () => {
  for (const pal of ROBOT_PALS) {
    assert.equal(savedPalSelection({ selection: pal.id }), pal.id);
    assert.equal(palShapeFor(pal.id), pal.shape);
  }
});
