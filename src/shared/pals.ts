export type PalScale = 0.75 | 1 | 1.25 | 1.5 | 2;

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
