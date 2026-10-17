import assert from "node:assert/strict";
import test from "node:test";
import { groupRecentThreads } from "./sidebar-recency";

const now = new Date(2026, 9, 16, 12);
const daysAgo = (days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

test("groups recent conversations by age while preserving their order", () => {
  const threads = [
    { id: "week-b", createdAt: daysAgo(4) },
    { id: "old", createdAt: daysAgo(40) },
    { id: "today", createdAt: daysAgo(0) },
    { id: "month", createdAt: daysAgo(15) },
    { id: "week-a", createdAt: daysAgo(2) },
  ];
  assert.deepEqual(groupRecentThreads(threads, now).map(({ label, threads: rows }) => [label, rows.map((row) => row.id)]), [
    ["Today", ["today"]],
    ["Last 7 days", ["week-b", "week-a"]],
    ["Last 30 days", ["month"]],
    ["Older", ["old"]],
  ]);
});

test("uses last activity when available and falls back from invalid timestamps", () => {
  const seconds = Math.floor(new Date(daysAgo(2)).getTime() / 1000);
  const threads = [
    { id: "active", createdAt: daysAgo(40), updatedAt: seconds },
    { id: "fallback", createdAt: daysAgo(15), updatedAt: "not a date" },
    { id: "missing-activity", createdAt: daysAgo(10), updatedAt: null },
    { id: "unknown" },
  ];
  assert.deepEqual(groupRecentThreads(threads, now).map(({ label, threads: rows }) => [label, rows.map((row) => row.id)]), [
    ["Last 7 days", ["active"]],
    ["Last 30 days", ["fallback", "missing-activity"]],
    ["Older", ["unknown"]],
  ]);
});
