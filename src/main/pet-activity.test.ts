import assert from "node:assert/strict";
import test from "node:test";
import { PetActivity, petTurnActivityKey } from "./pet-activity";

test("scheduled turns share one activity key and internal tuning stays hidden", () => {
  assert.equal(petTurnActivityKey("thread-a"), "turn:thread-a");
  assert.equal(petTurnActivityKey("thread-a", "daily-report"), "scheduled:daily-report");
  assert.equal(petTurnActivityKey("thread-a", "tune:thread-a"), null);

  const activity = new PetActivity();
  activity.start("scheduled:daily-report");
  activity.actionStarted(petTurnActivityKey("thread-a", "daily-report")!, "tool:1");
  activity.actionFinished(petTurnActivityKey("thread-a", "daily-report")!, "tool:1", true);
  activity.finish("scheduled:daily-report", "completed");
  assert.equal(activity.completedThreads, 1);
  assert.equal(activity.completedActions, 1);
});

test("pet remains working until every concurrent job ends", () => {
  const activity = new PetActivity();
  assert.equal(activity.start("turn:a"), "working");
  assert.equal(activity.start("scheduled:b"), "working");
  assert.equal(activity.runningCount, 2);
  assert.equal(activity.finish("turn:a", "completed"), "working");
  assert.equal(activity.finish("scheduled:b", "completed"), "done");
  assert.equal(activity.clearRecent(), "idle");
});

test("failed jobs signal failure; interruptions do not claim completion", () => {
  const activity = new PetActivity();
  activity.start("turn:a");
  assert.equal(activity.finish("turn:a", "failed"), "failed");
  assert.equal(activity.start("turn:b"), "working");
  assert.equal(activity.finish("turn:b", "interrupted"), "idle");
  assert.equal(activity.finish("missing", "completed"), "idle");
  assert.equal(activity.reset(), "idle");
});

test("a parallel success does not hide an earlier failure", () => {
  const activity = new PetActivity();
  activity.start("turn:a");
  activity.start("turn:b");
  assert.equal(activity.finish("turn:a", "failed"), "working");
  assert.equal(activity.finish("turn:b", "completed"), "failed");
});

test("counts completed actions and threads without duplicating item events", () => {
  const activity = new PetActivity();
  activity.start("turn:a");
  activity.start("turn:a");
  activity.start("turn:b");
  assert.equal(activity.runningCount, 2);
  assert.equal(activity.actionStarted("turn:a", "tool:1"), true);
  assert.equal(activity.actionStarted("turn:a", "tool:1"), false);
  assert.equal(activity.inFlightActions, 1);
  assert.equal(activity.actionFinished("turn:a", "tool:1", true), true);
  assert.equal(activity.actionFinished("turn:a", "tool:1", true), false);
  assert.equal(activity.actionFinished("turn:b", "tool:2", false), true);
  assert.equal(activity.completedActions, 1);
  assert.equal(activity.inFlightActions, 0);
  activity.finish("turn:a", "completed");
  activity.finish("turn:b", "failed");
  assert.equal(activity.completedThreads, 1);
  assert.equal(activity.completedActions, 1);
  activity.clearRecent();
  assert.equal(activity.completedActions, 0);
  assert.equal(activity.completedThreads, 0);
});
