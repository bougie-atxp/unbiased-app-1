import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { atomicJson, locked, readJson } from "./atomic-store";

export type SourceAttachment = {
  id: string;
  repositoryId: string | null;
  checkoutId: string;
  path: string;
  kind: "git" | "directory";
};
export type ProjectRecord = {
  id: string;
  name: string;
  folders: string[];
  primary: string;
  icon: string;
  color: string | null;
  sources: SourceAttachment[];
};
export function projectRecord(
  raw: unknown,
  previous?: ProjectRecord,
): ProjectRecord {
  const p =
    typeof raw === "string"
      ? { folders: [raw] }
      : (raw as Partial<ProjectRecord>);
  if (
    !p ||
    !Array.isArray(p.folders) ||
    !p.folders.length ||
    p.folders.some((f) => typeof f !== "string" || !f.startsWith("/"))
  )
    throw new Error("Invalid project folders");
  const folders = [...new Set(p.folders)];
  const sources = folders.map((path) => {
    const old =
      previous?.sources.find((s) => s.path === path) ??
      p.sources?.find((s) => s.path === path);
    if (old) {
      if (old.kind === "directory" && existsSync(join(path, ".git")))
        return { ...old, kind: "git" as const, repositoryId: randomUUID() };
      return old;
    }
    const kind = existsSync(join(path, ".git"))
      ? ("git" as const)
      : ("directory" as const);
    return {
      id: randomUUID(),
      repositoryId: kind === "git" ? randomUUID() : null,
      checkoutId: randomUUID(),
      path,
      kind,
    };
  });
  return {
    id: previous?.id ?? p.id ?? randomUUID(),
    name: p.name?.trim() || folders[0].split("/").pop() || folders[0],
    folders,
    primary: folders.includes(p.primary ?? "") ? p.primary! : folders[0],
    icon: p.icon ?? "folder",
    color: p.color ?? null,
    sources,
  };
}
export function readProjects(file: string): ProjectRecord[] {
  return locked(file, () => {
    const raw = readJson<unknown>(file, []);
    if (!Array.isArray(raw))
      throw new Error(
        "Invalid projects file; repair it before editing projects",
      );
    const records = raw.map((p) => projectRecord(p));
    if (JSON.stringify(raw) !== JSON.stringify(records))
      atomicJson(file, records);
    return records;
  });
}
export type Membership = {
  projectId: string | null;
  resolution: "explicit" | "inferred" | "ambiguous" | "regular" | "unresolved";
  candidates?: string[];
};
export function inferMembership(
  projects: ProjectRecord[],
  cwd: string | undefined,
  worktrees: Record<string, { project: string }> = {},
): Membership {
  const path = cwd && (worktrees[cwd]?.project ?? cwd);
  const candidates = projects
    .filter(
      (p) =>
        path &&
        p.folders.some((f) => {
          const rel = relative(f, path);
          return (
            rel === "" ||
            (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("/"))
          );
        }),
    )
    .map((p) => p.id);
  if (candidates.length > 1)
    return { projectId: null, resolution: "ambiguous", candidates };
  return candidates.length
    ? { projectId: candidates[0], resolution: "inferred" }
    : { projectId: null, resolution: "regular" };
}
export function membershipFor(
  file: string,
  id: string,
  projects: ProjectRecord[],
  cwd?: string,
  worktrees?: Record<string, { project: string }>,
): Membership {
  return locked(file, () => {
    const records = readJson<Record<string, Membership>>(file, {});
    if (Object.hasOwn(records, id)) return records[id];
    if (cwd === undefined) return { projectId: null, resolution: "unresolved" };
    const membership = inferMembership(projects, cwd, worktrees);
    Object.defineProperty(records, id, {
      value: membership,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    atomicJson(file, records);
    return membership;
  });
}
export function assignMembership(
  file: string,
  id: string,
  projectId: string | null,
): void {
  locked(file, () => {
    const records = readJson<Record<string, Membership>>(file, {});
    Object.defineProperty(records, id, {
      value: { projectId, resolution: "explicit" },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    atomicJson(file, records);
  });
}
