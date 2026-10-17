export type PalSelection = "robot" | "original";

export function savedPalSelection(saved: { selection?: unknown; folder?: unknown }): PalSelection {
  if (saved.selection === "original" || saved.folder === "default") return "original";
  return "robot";
}
