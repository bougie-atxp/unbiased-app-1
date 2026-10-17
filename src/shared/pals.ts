export type PalScale = 0.75 | 1 | 1.25 | 1.5 | 2;

export type PalShape = "rectangle" | "square" | "circle" | "hexagon";

export const ROBOT_PALS = [
  { id: "robot", name: "Robot Head", description: "Rectangle", shape: "rectangle" },
  { id: "robot-square", name: "Square Head", description: "Square", shape: "square" },
  { id: "robot-circle", name: "Round Head", description: "Circle", shape: "circle" },
  { id: "robot-hexagon", name: "Hex Head", description: "Hexagon", shape: "hexagon" },
] as const;

export type PalSelection = (typeof ROBOT_PALS)[number]["id"];

export function isPalSelection(id: unknown): id is PalSelection {
  return ROBOT_PALS.some((pal) => pal.id === id);
}

export function palShapeFor(id: string): PalShape {
  return ROBOT_PALS.find((pal) => pal.id === id)?.shape ?? "rectangle";
}

export type PalChoice = {
  id: string;
  name: string;
  description?: string;
};

export type PalsSettings = {
  visible: boolean;
  selected: string;
  scale: PalScale;
  choices: PalChoice[];
};
