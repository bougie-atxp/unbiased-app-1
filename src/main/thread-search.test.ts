import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchingMessageSnippet, messagesFromTranscriptEntries } from "./thread-search";

test("finds a keyword buried in later chat messages", () => {
  const snippet = matchingMessageSnippet(["An unrelated introduction", "First paragraph. ".repeat(20) + "Stripe projects are configured here."], "stripe projects");
  assert.ok(snippet?.includes("Stripe projects"));
  assert.ok(snippet?.startsWith("… "));
});

test("search is case-insensitive and does not return unrelated messages", () => {
  assert.equal(matchingMessageSnippet(["Penelope appears later"], "PENELOPE"), "Penelope appears later");
  assert.equal(matchingMessageSnippet(["Odysseus appears later"], "Penelope"), null);
  assert.equal(matchingMessageSnippet(["Anything"], " "), null);
});

test("saved transcript messages inside work folds are searchable", () => {
  const messages = messagesFromTranscriptEntries([
    { kind: "user", text: "Tell me a story" },
    { kind: "work", entries: [{ kind: "assistant", text: "Penelope waited." }, { kind: "command", output: "private tool output" }] },
  ]);
  assert.deepEqual(messages, ["Tell me a story", "Penelope waited."]);
  assert.equal(matchingMessageSnippet(messages, "Penelope"), "Penelope waited.");
  assert.equal(matchingMessageSnippet(messages, "private"), null);
});
