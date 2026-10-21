import assert from "node:assert/strict";
import test from "node:test";
import { alignRunningTurnStart, chooseTranscript, initialTranscriptPage, replaceTranscriptTail, retitleTranscript, shiftRunningTurnStart, transcriptPage } from "../shared/transcript-pages";

type Row = { kind: string; text?: string; at?: number; name?: string; entries?: Row[] };

test("cache-only rows survive while stale flat folds are repaired", () => {
  const history: Row[] = [{ kind: "user", text: "hi" }, { kind: "work", entries: [{ kind: "assistant", text: "working" }] }, { kind: "assistant", text: "done" }];
  const cached: Row[] = [{ kind: "user", text: "hi" }, { kind: "assistant", text: "working" }, { kind: "work", entries: [{ kind: "command", text: "tool" }] }, { kind: "assistant", text: "done" }];
  assert.deepEqual(chooseTranscript(history, cached), [cached[0], { kind: "work", entries: [cached[1], cached[2].entries![0]] }, cached[3]]);
});

test("equal richness favors engine history", () => {
  const history: Row[] = [{ kind: "user", text: "hi", at: 123 }, { kind: "assistant", text: "done" }];
  assert.equal(chooseTranscript(history, [{ kind: "user", text: "hi" }, { kind: "assistant", text: "done" }]), history);
});

test("pages are bounded, ordered, and can reach the first row", () => {
  const entries = Array.from({ length: 500 }, (_, index) => index);
  const latest = transcriptPage(entries, entries.length, 80);
  assert.deepEqual(latest, { entries: entries.slice(420), offset: 420, total: 500 });
  const older = transcriptPage(entries, latest.offset, 80);
  assert.deepEqual(older.entries, entries.slice(340, 420));
  assert.deepEqual(transcriptPage(entries, 5, 80).entries, entries.slice(0, 5));
  assert.equal(transcriptPage(entries, 0, 80).entries.length, 0);
  assert.equal(transcriptPage(entries, 500, 10_000).entries.length, 200);
});

test("live tail updates preserve unloaded history without duplication", () => {
  const existing = Array.from({ length: 250 }, (_, index) => index);
  assert.equal(replaceTranscriptTail(existing, 170, [...existing.slice(170), 250]), true);
  assert.deepEqual(existing, Array.from({ length: 251 }, (_, index) => index));
  assert.equal(replaceTranscriptTail(existing, 90, [...existing.slice(90), 251]), true);
  assert.deepEqual(existing, Array.from({ length: 252 }, (_, index) => index));
  assert.equal(replaceTranscriptTail(existing, -1, []), false);
  assert.equal(replaceTranscriptTail(existing, 253, []), false);
});

test("opening an active turn keeps all of its work available for the final fold", () => {
  const entries = Array.from({ length: 10_000 }, (_, index) => index);
  const page = initialTranscriptPage(entries, 100);
  assert.equal(page.entries.length, 9_900);
  assert.equal(page.offset, 100);
  assert.equal(page.runningTurnStart, 0);
  assert.deepEqual(initialTranscriptPage(entries, null).entries, entries.slice(-80));
});

test("cached UI-only rows before a live turn do not shift its fold boundary", () => {
  const history: Row[] = [
    { kind: "user", text: "old" },
    { kind: "assistant", text: "done" },
    { kind: "user", text: "new" },
    { kind: "assistant", text: "working" },
  ];
  const chosen: Row[] = [
    { kind: "user", text: "old" },
    { kind: "assistant", text: "done" },
    { kind: "assistant", text: "UI-only notice" },
    { kind: "user", text: "new" },
    { kind: "assistant", text: "working" },
  ];
  assert.equal(alignRunningTurnStart(history, chosen, 2), 3);
  assert.equal(alignRunningTurnStart(history, history, 2), 2);
});

test("live-turn alignment includes every steered user message", () => {
  const history: Row[] = [
    { kind: "user", text: "old" },
    { kind: "assistant", text: "done" },
    { kind: "user", text: "start" },
    { kind: "assistant", text: "working" },
    { kind: "user", text: "steer" },
  ];
  const chosen: Row[] = [
    { kind: "user", text: "old" },
    { kind: "assistant", text: "done" },
    { kind: "assistant", text: "UI-only notice" },
    { kind: "user", text: "start" },
    { kind: "assistant", text: "working" },
    { kind: "user", text: "steer" },
  ];
  assert.equal(alignRunningTurnStart(history, chosen, 2), 3);
});

test("prepending older rows keeps a live turn's fold boundary on the same row", () => {
  assert.equal(shiftRunningTurnStart(0, 80), 80);
  assert.equal(shiftRunningTurnStart(12, 40), 52);
  assert.equal(shiftRunningTurnStart(null, 40), null);
});

test("agent names are applied inside folded work", () => {
  const entries: Row[] = [{ kind: "work", entries: [{ kind: "agent", name: "raw" }] }];
  assert.deepEqual(retitleTranscript(entries, { raw: "Zeno" }), [{ kind: "work", entries: [{ kind: "agent", name: "Zeno" }] }]);
});
