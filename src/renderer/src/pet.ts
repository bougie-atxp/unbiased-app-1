import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { palShapeFor, type PalSelection } from "../../shared/pals";
import { RobotHead } from "./robot-heads/RobotHead";
import type { RobotHeadDirection, RobotHeadState } from "./robot-heads/types";
import "./pet.css";

type PetState = "idle" | "working" | "done" | "failed";
type PetUpdate = {
  state: PetState;
  runningCount: number;
  completedActions: number;
  completedThreads: number;
  inFlightActions: number;
  selection: PalSelection;
  scale: number;
};
type IncomingPetUpdate = Pick<PetUpdate, "state" | "runningCount" | "scale">
  & Partial<Pick<PetUpdate, "completedActions" | "completedThreads" | "inFlightActions" | "selection">>;

declare global {
  interface Window {
    pet: {
      onUpdate: (callback: (value: IncomingPetUpdate) => void) => () => void;
      onHover: (callback: (hovered: boolean) => void) => () => void;
      onMotion: (callback: (direction: RobotHeadDirection | null) => void) => () => void;
      ready: () => void;
      menu: () => void;
    };
  }
}

const root = document.getElementById("pet")!;
const status = document.getElementById("status")!;
const robotRoot = createRoot(document.getElementById("robot")!);
let current: PetUpdate = {
  state: "idle", runningCount: 0, completedActions: 0, completedThreads: 0,
  inFlightActions: 0, selection: "robot", scale: 1,
};
let motion: RobotHeadDirection | null = null;

function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function renderRobot(): void {
  const state: RobotHeadState = current.state === "done" ? "happy" : current.state === "failed" ? "error" : current.state;
  robotRoot.render(createElement(RobotHead, {
    state,
    shape: palShapeFor(current.selection),
    direction: motion,
    size: 76,
    interactive: false,
    color: "#ed6b5f",
    trimColor: "#a9b8c2",
    screenColor: "#e8f7fb",
    "aria-label": `Robot Head Pal, ${current.state}`,
  }));
}

window.pet.onUpdate((incoming) => {
  current = {
    ...incoming,
    completedActions: Number.isFinite(incoming.completedActions) ? incoming.completedActions! : 0,
    completedThreads: Number.isFinite(incoming.completedThreads) ? incoming.completedThreads! : 0,
    inFlightActions: Number.isFinite(incoming.inFlightActions) ? incoming.inFlightActions! : 0,
    selection: incoming.selection ?? "robot",
  };
  root.style.transform = `scale(${current.scale})`;
  root.className = `pet ${current.state}${motion ? ` moving-${motion}` : ""}`;
  root.setAttribute("aria-label", `Unbiased Pal, ${current.state}`);
  status.textContent = current.state === "working"
    ? `${compactCount(current.runningCount)} running · ${compactCount(current.completedActions)} actions`
    : current.state === "done" ? `${compactCount(current.completedThreads)} done · ${compactCount(current.completedActions)} actions`
      : current.state === "failed" ? `Failed · ${compactCount(current.completedActions)} actions` : "";
  renderRobot();
});

window.pet.onHover((hovered) => root.classList.toggle("hovered", hovered));
window.pet.onMotion((direction) => {
  motion = direction;
  root.classList.remove("moving-left", "moving-right", "moving-up", "moving-down");
  if (direction) root.classList.add(`moving-${direction}`);
  renderRobot();
});
window.pet.ready();
document.getElementById("menu")!.addEventListener("click", () => window.pet.menu());
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.pet.menu();
});
