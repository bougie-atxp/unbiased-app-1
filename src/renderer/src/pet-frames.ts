export function findSpriteFrames(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rowCount: number,
): number[][] {
  const cellWidth = width / 8;
  const cellHeight = height / rowCount;
  return Array.from({ length: rowCount }, (_, row) => {
    const frames: number[] = [];
    for (let column = 0; column < 8; column++) {
      const left = Math.floor(column * cellWidth);
      const right = Math.floor((column + 1) * cellWidth);
      const top = Math.floor(row * cellHeight);
      const bottom = Math.floor((row + 1) * cellHeight);
      let visible = false;
      for (let y = top; y < bottom && !visible; y++) {
        for (let x = left; x < right; x++) {
          if (pixels[(y * width + x) * 4 + 3] > 0) {
            visible = true;
            break;
          }
        }
      }
      if (visible) frames.push(column);
    }
    return frames.length ? frames : [0];
  });
}

export type PetMotion = "left" | "right" | "up" | "down";
export type PetAnimationState = "idle" | "working" | "done" | "failed";

export function petAnimationRow(
  state: PetAnimationState,
  reviewing: boolean,
  motion: PetMotion | null,
): number {
  if (motion) return { right: 1, left: 2, up: 4, down: 6 }[motion];
  if (state === "idle") return 0;
  if (state === "done") return 3;
  if (state === "failed") return 5;
  if (reviewing) return 8;
  return 7;
}
