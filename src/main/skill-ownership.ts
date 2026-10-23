import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { atomicJson, locked, readJson } from "./atomic-store";

export type SkillOwnership =
  | { scope: "global" }
  | { scope: "project"; projectId: string }
  // Pre-existing repository skills may have no unique project association.
  | { scope: "folder" };

type Project = { id: string; folders: string[] };
type Records = Record<string, SkillOwnership>;

export function insideSkillRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !!rel && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}

/** Ownership is app metadata; it does not change the engine's discovery roots. */
export class SkillOwnershipStore {
  constructor(private readonly file: string) {}

  private records(): Records {
    const records = readJson<Records>(this.file, {});
    if (!records || typeof records !== "object" || Array.isArray(records)) throw new Error("Invalid skill ownership store");
    for (const value of Object.values(records)) {
      if (!value || typeof value !== "object" ||
          !["global", "project", "folder"].includes(value.scope) ||
          (value.scope === "project" && (typeof value.projectId !== "string" || !value.projectId))) {
        throw new Error("Invalid skill ownership record");
      }
    }
    return records;
  }

  assign(path: string, ownership: SkillOwnership): void {
    if (!isAbsolute(path)) throw new Error("An absolute skill path is required");
    if (ownership.scope === "project" && !ownership.projectId) throw new Error("A project ID is required");
    locked(this.file, () => {
      const records = this.records();
      records[resolve(path)] = ownership;
      atomicJson(this.file, records);
    });
  }

  forget(path: string): void {
    locked(this.file, () => {
      const records = this.records();
      delete records[resolve(path)];
      atomicJson(this.file, records);
    });
  }

  ownership(path: string, projects: Project[], globalRoots: string[], engineScope: string): SkillOwnership {
    return locked(this.file, () => {
      const records = this.records();
      const key = resolve(path);
      if (Object.hasOwn(records, key)) return records[key];
      let ownership: SkillOwnership;
      if (globalRoots.some(root => insideSkillRoot(root, path))) {
        ownership = { scope: "global" };
      } else {
        const candidates = projects.filter(project => project.folders.some(folder =>
          [".codex", ".agents"].some(config => insideSkillRoot(join(folder, config, "skills"), path)),
        ));
        ownership = candidates.length === 1
          ? { scope: "project", projectId: candidates[0].id }
          : candidates.length || ["repo", "project"].includes(engineScope)
            ? { scope: "folder" }
            : { scope: "global" };
      }
      // Freeze only unambiguous associations. Browsing a shared folder must not
      // silently assign its older skills to whichever project was opened first.
      if (ownership.scope !== "folder") {
        records[key] = ownership;
        atomicJson(this.file, records);
      }
      return ownership;
    });
  }
}

/** Record ownership with the installed files, or roll back our failed new copy. */
export function installOwnedSkill(source: string, root: string, name: string, ownership: SkillOwnership, store: SkillOwnershipStore): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new Error("Invalid skill name");
  const destination = join(root, name);
  if (existsSync(destination)) throw new Error(`A skill named "${name}" is already there. Rename it or remove the existing one.`);
  mkdirSync(root, { recursive: true });
  // Reserve this directory so a failed copy never removes an existing skill.
  mkdirSync(destination);
  try {
    if (statSync(source).isDirectory()) cpSync(source, destination, { recursive: true });
    else cpSync(source, join(destination, "SKILL.md"));
    const manifest = join(destination, "SKILL.md");
    store.assign(manifest, ownership);
    return manifest;
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}
