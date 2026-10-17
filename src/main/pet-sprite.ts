import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export function activePalFolder(selection: string | undefined, noirFolder: string | null): string | null {
  return selection === "default" ? null : selection ?? noirFolder;
}

export function readPetSprite(folder: string): string | null {
  try {
    const metadataPath = join(folder, "pet.json");
    if (statSync(metadataPath).size > 64 * 1024) return null;
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (!metadata || typeof metadata !== "object") return null;
    for (const [name, mime] of [["spritesheet.webp", "image/webp"], ["spritesheet.png", "image/png"]] as const) {
      const path = join(folder, name);
      let size: number;
      try { size = statSync(path).size; } catch { continue; }
      if (size < 256 || size > 16 * 1024 * 1024) return null;
      const bytes = readFileSync(path);
      const valid = mime === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valid) return null;
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function readPetSummary(folder: string): { name: string; description?: string } | null {
  try {
    const metadataPath = join(folder, "pet.json");
    if (statSync(metadataPath).size > 64 * 1024) return null;
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (!metadata || typeof metadata !== "object") return null;
    const name = [metadata.displayName, metadata.name].find((value) => typeof value === "string" && value.trim())?.trim() ?? basename(folder);
    if (!["spritesheet.webp", "spritesheet.png"].some((file) => {
      try { return statSync(join(folder, file)).isFile(); } catch { return false; }
    })) return null;
    const description = typeof metadata.description === "string" ? metadata.description.trim().slice(0, 140) : "";
    return { name: name.slice(0, 80), ...(description ? { description } : {}) };
  } catch {
    return null;
  }
}

export function readPetName(folder: string): string | null {
  return readPetSummary(folder)?.name ?? null;
}
