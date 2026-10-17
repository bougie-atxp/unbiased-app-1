import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activePalFolder, readPetName, readPetSprite, readPetSummary } from "./pet-sprite";

test("Noir is the default without replacing an explicitly selected Pal", () => {
  assert.equal(activePalFolder(undefined, "/pals/noir"), "/pals/noir");
  assert.equal(activePalFolder("/pals/tiko", "/pals/noir"), "/pals/tiko");
  assert.equal(activePalFolder("default", "/pals/noir"), null);
  assert.equal(activePalFolder(undefined, null), null);
});

test("locally installed WebP pets are accepted without Electron nativeImage", () => {
  const folder = mkdtempSync(join(tmpdir(), "unbiased-pet-"));
  try {
    writeFileSync(join(folder, "pet.json"), JSON.stringify({ name: "Test", description: "A focused little Pal" }));
    const bytes = Buffer.alloc(256);
    bytes.write("RIFF", 0);
    bytes.write("WEBP", 8);
    writeFileSync(join(folder, "spritesheet.webp"), bytes);
    assert.match(readPetSprite(folder) ?? "", /^data:image\/webp;base64,/);
    assert.equal(readPetName(folder), "Test");
    assert.deepEqual(readPetSummary(folder), { name: "Test", description: "A focused little Pal" });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a pet without a named sprite is not offered in Pals", () => {
  const folder = mkdtempSync(join(tmpdir(), "unbiased-pet-"));
  try {
    writeFileSync(join(folder, "pet.json"), JSON.stringify({ name: "No image" }));
    assert.equal(readPetName(folder), null);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("unnamed Petdex pets use their folder name", () => {
  const folder = mkdtempSync(join(tmpdir(), "unbiased-pet-"));
  try {
    writeFileSync(join(folder, "pet.json"), "{}");
    writeFileSync(join(folder, "spritesheet.png"), Buffer.alloc(256));
    assert.equal(readPetName(folder), folder.split("/").at(-1));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("Petdex display names are shown in Pals", () => {
  const folder = mkdtempSync(join(tmpdir(), "unbiased-pet-"));
  try {
    writeFileSync(join(folder, "pet.json"), JSON.stringify({ displayName: "Noir Webling", name: "Old name" }));
    writeFileSync(join(folder, "spritesheet.png"), Buffer.alloc(256));
    assert.equal(readPetSummary(folder)?.name, "Noir Webling");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("invalid image data is not sent to the pet renderer", () => {
  const folder = mkdtempSync(join(tmpdir(), "unbiased-pet-"));
  try {
    writeFileSync(join(folder, "pet.json"), "{}");
    writeFileSync(join(folder, "spritesheet.png"), Buffer.alloc(256));
    assert.equal(readPetSprite(folder), null);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
