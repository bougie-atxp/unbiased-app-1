import "./pet.css";
import { findSpriteFrames, petAnimationRow, type PetAnimationState, type PetMotion } from "./pet-frames";

type PetUpdate = {
  state: PetAnimationState;
  runningCount: number;
  completedActions: number;
  completedThreads: number;
  inFlightActions: number;
  sprite: string | null;
  scale: number;
};
type IncomingPetUpdate = Pick<PetUpdate, "state" | "runningCount" | "scale">
  & Partial<Pick<PetUpdate, "completedActions" | "completedThreads" | "inFlightActions">>
  & { sprite?: string | null };
declare global {
  interface Window {
    pet: {
      onUpdate: (callback: (value: IncomingPetUpdate) => void) => () => void;
      onHover: (callback: (hovered: boolean) => void) => () => void;
      onMotion: (callback: (direction: PetMotion | null) => void) => () => void;
      ready: () => void;
      menu: () => void;
    };
  }
}

const root = document.getElementById("pet")!;
const sprite = document.getElementById("sprite") as HTMLCanvasElement;
const spriteContext = sprite.getContext("2d")!;
spriteContext.imageSmoothingEnabled = false;
const status = document.getElementById("status")!;
let frame = 0;
let current: PetUpdate = { state: "idle", runningCount: 0, completedActions: 0, completedThreads: 0, inFlightActions: 0, sprite: null, scale: 1 };
let spriteRows = 9;
let loadedSprite: string | null = null;
let loadedImage: HTMLImageElement | null = null;
let framesByRow: number[][] = Array.from({ length: 11 }, () => [0, 1, 2, 3, 4, 5, 6, 7]);
let motion: PetMotion | null = null;
let reviewUntil = 0;
let paintedRow = -1;

function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function paintFrame(): void {
  if (!current.sprite || loadedSprite !== current.sprite || !loadedImage) return;
  const row = petAnimationRow(current.state, Date.now() < reviewUntil, motion);
  if (row !== paintedRow) {
    paintedRow = row;
    frame = 0;
  }
  const frames = framesByRow[row];
  const cellWidth = loadedImage.naturalWidth / 8;
  const cellHeight = loadedImage.naturalHeight / spriteRows;
  spriteContext.clearRect(0, 0, sprite.width, sprite.height);
  spriteContext.drawImage(
    loadedImage,
    frames[frame % frames.length] * cellWidth,
    row * cellHeight,
    cellWidth,
    cellHeight,
    0,
    0,
    sprite.width,
    sprite.height,
  );
  frame++;
}

window.pet.onUpdate((incoming) => {
  const update: PetUpdate = {
    ...incoming,
    completedActions: Number.isFinite(incoming.completedActions) ? incoming.completedActions! : 0,
    completedThreads: Number.isFinite(incoming.completedThreads) ? incoming.completedThreads! : 0,
    inFlightActions: Number.isFinite(incoming.inFlightActions) ? incoming.inFlightActions! : 0,
    sprite: incoming.sprite === undefined ? current.sprite : incoming.sprite,
  };
  if (update.state === "working" && update.completedActions > current.completedActions) {
    reviewUntil = Date.now() + 700;
  }
  if (update.state !== current.state || update.sprite !== current.sprite) frame = 0;
  current = update;
  root.style.transform = `scale(${update.scale})`;
  root.className = `pet ${update.state}${motion ? ` moving-${motion}` : ""}${update.sprite && loadedImage ? " has-sprite" : ""}`;
  root.setAttribute("aria-label", `Unbiased Pal, ${update.state}`);
  status.textContent = update.state === "working"
    ? `${compactCount(update.runningCount)} running · ${compactCount(update.completedActions)} actions`
    : update.state === "done" ? `${compactCount(update.completedThreads)} done · ${compactCount(update.completedActions)} actions`
      : update.state === "failed" ? `Failed · ${compactCount(update.completedActions)} actions` : "";
  if (update.sprite && update.sprite !== loadedSprite) {
    const image = new Image();
    image.onload = () => {
      if (current.sprite !== update.sprite || image.naturalWidth < 256 || image.naturalHeight < 256) return;
      spriteRows = image.naturalHeight / image.naturalWidth > 1.32 ? 11 : 9;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(image, 0, 0);
        framesByRow = findSpriteFrames(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
          spriteRows,
        );
      }
      loadedImage = image;
      loadedSprite = update.sprite;
      root.classList.add("has-sprite");
      paintFrame();
    };
    image.src = update.sprite;
  }
  paintFrame();
});
window.pet.onHover((hovered) => root.classList.toggle("hovered", hovered));
window.pet.onMotion((direction) => {
  motion = direction;
  root.classList.remove("moving-left", "moving-right", "moving-up", "moving-down");
  if (direction) root.classList.add(`moving-${direction}`);
  paintFrame();
});
window.pet.ready();
window.setInterval(paintFrame, 140);
document.getElementById("menu")!.addEventListener("click", () => window.pet.menu());
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.pet.menu();
});
