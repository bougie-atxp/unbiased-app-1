import { isPalSelection, type PalSelection } from "../shared/pals";

export type { PalSelection } from "../shared/pals";

export function savedPalSelection(saved: { selection?: unknown; folder?: unknown }): PalSelection {
  return isPalSelection(saved.selection) ? saved.selection : "robot";
}
