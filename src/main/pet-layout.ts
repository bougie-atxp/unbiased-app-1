export const PET_SCALES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PetScale = (typeof PET_SCALES)[number];

type Rect = { x: number; y: number; width: number; height: number };

export function petScale(value: unknown): PetScale {
  return PET_SCALES.includes(value as PetScale) ? value as PetScale : 1;
}

export function petWindowSize(scale: PetScale): Pick<Rect, "width" | "height"> {
  return { width: Math.round(112 * scale), height: Math.round(130 * scale) };
}

export function clampPetPosition(
  position: Pick<Rect, "x" | "y">,
  size: Pick<Rect, "width" | "height">,
  area: Rect,
): Pick<Rect, "x" | "y"> {
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - size.width, position.x)),
    y: Math.max(area.y, Math.min(area.y + area.height - size.height, position.y)),
  };
}

export function pointInPetWindow(point: Pick<Rect, "x" | "y">, bounds: Rect): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width
    && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}
