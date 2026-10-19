import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appOpenUILibrary, inspectOpenUI } from "../renderer/src/openui-visual";
import { OPENUI_PROMPT_COMPONENTS, OPENUI_VISUAL_INSTRUCTIONS, VISUALIZE_DIRECTIVE } from "./visual-instructions";

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

test("visualize can be chosen for one turn while visual answers remain available automatically", () => {
  const skill = readFileSync(new URL("../../resources/skills/visualize/SKILL.md", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../renderer/src/App.tsx", import.meta.url), "utf8");
  const preload = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

  assert.match(skill, /^name: visualize$/m);
  assert.match(skill, /Use when the user asks/);
  assert.match(skill, /directly in a `visual-html` fence/);
  assert.match(skill, /Default to a self-contained `visual-html` scene/);
  assert.match(skill, /Reserve Mermaid for small flows or relationships/);
  assert.match(OPENUI_VISUAL_INSTRUCTIONS.join("\n"), /even when the user has not selected Visualize/);
  assert.match(OPENUI_VISUAL_INSTRUCTIONS.join("\n"), /prefer a self-contained visual-html scene/);
  assert.match(OPENUI_VISUAL_INSTRUCTIONS.join("\n"), /Use Mermaid only for a compact relationship or flow/);
  assert.match(OPENUI_VISUAL_INSTRUCTIONS.join("\n"), /raw visual-html fence is the preferred format for bespoke interactive scenes/);
  assert.match(VISUALIZE_DIRECTIVE, /explicitly wants a visual answer/);
  assert.match(VISUALIZE_DIRECTIVE, /complete, valid fenced visual-html or openui block/);
  assert.match(VISUALIZE_DIRECTIVE, /Default to visual-html for an explanatory scene or interactive lesson/);
  assert.match(VISUALIZE_DIRECTIVE, /OpenUI for a simple chart, table, or text-led layout/);
  assert.match(renderer, /visualize: visualizeSelected/);
  assert.match(renderer, /visualize: q\.visualize/);
  assert.match(preload, /visualize: options\?\.visualize/);
  assert.match(main, /if \(visualize\) input\.unshift\(\{ type: "text", text: VISUALIZE_DIRECTIVE \}\)/);
});
