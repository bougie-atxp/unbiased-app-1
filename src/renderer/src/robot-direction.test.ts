import assert from "node:assert/strict";
import test from "node:test";
import { RobotSim } from "./robot-heads/tv/sim";

function posed(direction: "left" | "right" | "up" | "down") {
  const robot = new RobotSim(0.3, "working");
  robot.direction = direction;
  for (let frame = 0; frame < 40; frame++) robot.update(1 / 60);
  return robot.pose;
}

test("direction turns the head while the agent is working", () => {
  assert.ok(posed("left").yaw < -0.1);
  assert.ok(posed("right").yaw > 0.1);
  assert.ok(posed("up").pitch > 0.1);
  assert.ok(posed("down").pitch < -0.1);
});

test("releasing direction eases toward the working pose", () => {
  const robot = new RobotSim(0.3, "working");
  robot.direction = "right";
  for (let frame = 0; frame < 40; frame++) robot.update(1 / 60);
  const draggedYaw = robot.pose.yaw;
  robot.direction = null;
  for (let frame = 0; frame < 90; frame++) robot.update(1 / 60);
  assert.ok(Math.abs(robot.pose.yaw) < Math.abs(draggedYaw));
});
