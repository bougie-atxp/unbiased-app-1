import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ProjectRecord = {
  id: string;
  name: string;
  folders: string[];
  primary: string;
  icon: string;
  color: string | null;
  /** Existing projects keep their repository-scoped memory during migration. */
  legacyMemoryPath?: string;
};
type Memberships = {
  threads: Record<string, string | null>;
  /** Historical cwd inference only. Never transfer an old folder's chats to a new project. */
  folders: Record<string, string>;
};
const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function readJson(file: string, fallback: unknown): any {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error; // Do not overwrite an unreadable store with an empty one.
  }
}
function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}

/** All callers run synchronously on Electron's main thread; no async read/write gaps. */
export class ProjectStore {
  constructor(private readonly directory: string) {}
  private file(name: string): string { return join(this.directory, name); }

  list(): ProjectRecord[] {
    const raw = readJson(this.file("projects.json"), []);
    if (!Array.isArray(raw)) throw new Error("Invalid projects store");
    const ids = new Set<string>();
    const records: ProjectRecord[] = raw.flatMap((entry) => {
      const p = typeof entry === "string" ? { folders: [entry], primary: entry } : entry;
      if (!p || !Array.isArray(p.folders)) return [];
      const folders = [...new Set<string>(p.folders.filter((f: unknown) => typeof f === "string" && !!f))];
      if (!folders.length) return [];
      const primary = folders.includes(p.primary) ? p.primary : folders[0];
      const id = typeof p.id === "string" && p.id && !ids.has(p.id) ? p.id : randomUUID();
      ids.add(id);
      return [{ ...p, id, name: p.name || primary.split("/").filter(Boolean).pop() || primary,
        folders, primary, icon: p.icon ?? "folder", color: p.color ?? null,
        ...(!p.id ? { legacyMemoryPath: primary } : {}),
      }];
    });
    // Persist IDs before any caller can create a second project at the same path.
    if (JSON.stringify(raw) !== JSON.stringify(records)) writeJson(this.file("projects.json"), records);
    const memberships = this.memberships();
    let changed = false;
    for (const project of [...records].reverse()) for (const folder of project.folders) {
      if (!own(memberships.folders, folder)) {
        Object.defineProperty(memberships.folders, folder, { value: project.id, enumerable: true, configurable: true, writable: true });
        changed = true;
      }
    }
    if (changed) this.saveMemberships(memberships);
    return records;
  }
  save(records: ProjectRecord[]): void {
    this.list(); // Freeze historical folder ownership before changing the project list.
    writeJson(this.file("projects.json"), records);
    this.list();
  }
  private memberships(): Memberships {
    const state = readJson(this.file("project-memberships.json"), { threads: {}, folders: {} });
    if (!state || typeof state.threads !== "object" || !state.threads || typeof state.folders !== "object" || !state.folders) {
      throw new Error("Invalid project membership store");
    }
    return state;
  }
  private saveMemberships(state: Memberships): void {
    writeJson(this.file("project-memberships.json"), state);
  }
  assign(threadId: string, projectId: string | null): void {
    const state = this.memberships();
    Object.defineProperty(state.threads, threadId, { value: projectId, enumerable: true, configurable: true, writable: true });
    this.saveMemberships(state);
  }
  projectFor(threadId: string | null, cwd: string | null, worktrees: Record<string, { project: string }> = {}): ProjectRecord | null {
    const records = this.list();
    const state = this.memberships();
    if (threadId && own(state.threads, threadId)) return records.find((p) => p.id === state.threads[threadId]) ?? null;
    // Leave the old path-based file intact for compatibility and recovery.
    const legacy = threadId ? readJson(this.file("thread-projects.json"), {}) : {};
    const folder = threadId && own(legacy, threadId) ? legacy[threadId] : cwd && worktrees[cwd] ? worktrees[cwd].project : cwd;
    const owner = typeof folder === "string" && own(state.folders, folder) ? state.folders[folder] : null;
    const project = records.find((p) => p.id === owner && p.folders.includes(folder)) ?? null;
    // A cold resume may not know cwd yet. Do not freeze that as an unassigned
    // chat, or prevent a later Open project from adopting an unclaimed folder.
    if (threadId && typeof folder === "string" && own(state.folders, folder)) this.assign(threadId, project?.id ?? null);
    return project;
  }
}
