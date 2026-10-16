import assert from "node:assert/strict";
import test from "node:test";
import { appOpenUILibrary, inspectOpenUI } from "../renderer/src/openui-visual";
import { OPENUI_PROMPT_COMPONENTS, OPENUI_VISUAL_INSTRUCTIONS } from "./visual-instructions";

test("the prompt documents only registered OpenUI components", () => {
  for (const signature of OPENUI_PROMPT_COMPONENTS) {
    const name = signature.slice(0, signature.indexOf("("));
    assert.ok(appOpenUILibrary.components[name], name);
  }
  const prompt = OPENUI_VISUAL_INSTRUCTIONS.join("\n");
  assert.doesNotMatch(prompt, /GuidedExplainer|@unbiased\/iui/);
  assert.match(prompt, /upstream OpenUI/);
  assert.equal(inspectOpenUI('root = Stack([TextContent("Move diagonally"), Tabs([TabItem("setup", "Setup", [TextContent("Place 12 pieces")]), TabItem("move", "Move", [TextContent("Use dark squares")])])])').valid, true);
});
