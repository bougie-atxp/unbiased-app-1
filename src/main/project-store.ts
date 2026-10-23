import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { atomicJson as writeJson, readJson as readStoredJson } from "./atomic-store";
import { inferMembership, projectRecord, type Membership, type ProjectRecord as PortableProjectRecord, type SourceAttachment } from "./project-identity";

export type ProjectRecord = {
  id: string;
  name: string;
  folders: string[];
  primary: string;
  icon: string;
  color: string | null;
  /** Existing projects keep their repository-scoped memory during migration. */
  legacyMemoryPath?: string;
  sources?: SourceAttachment[];
};
type Memberships = {
  threads: Record<string, string | null>;
  /** Historical cwd inference only. Never transfer an old folder's chats to a new project. */
  folders: Record<string, string>;
};
const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function readJson(file: string, fallback: unknown): any {
  return readStoredJson(file, fallback);
}

/** All callers run synchronously on Electron's main thread; no async read/write gaps. */
export class ProjectStore {
  constructor(private readonly directory: string) {}
  private file(name: string): string { return join(this.directory, name); }

  list(): PortableProjectRecord[] {
    const raw = readJson(this.file("projects.json"), []);
    if (!Array.isArray(raw)) throw new Error("Invalid projects store");
    const ids = new Set<string>();
    const records: PortableProjectRecord[] = raw.flatMap((entry) => {
      const p = typeof entry === "string" ? { folders: [entry], primary: entry } : entry;
      if (!p || !Array.isArray(p.folders)) return [];
      const folders = [...new Set<string>(p.folders.filter((f: unknown) => typeof f === "string" && !!f))];
      if (!folders.length) return [];
      const primary = folders.includes(p.primary) ? p.primary : folders[0];
      const id = typeof p.id === "string" && p.id && !ids.has(p.id) ? p.id : randomUUID();
      ids.add(id);
      return [projectRecord({ ...p, id, name: p.name || primary.split("/").filter(Boolean).pop() || primary,
        folders, primary, icon: p.icon ?? "folder", color: p.color ?? null,
        ...(!p.id ? { legacyMemoryPath: primary } : {}),
      })];
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
  membership(threadId: string | null, cwd?: string, worktrees: Record<string, { project: string }> = {}): Membership {
    const records = this.list();
    const state = this.memberships();
    const resolve = (projectId: string | null, resolution: Membership["resolution"]): Membership => ({
      projectId: records.some(p => p.id === projectId) ? projectId : null, resolution,
    });
    if (threadId && own(state.threads, threadId)) return resolve(state.threads[threadId], "explicit");
    // Preserve assignments saved by earlier cloud-foundations builds. All new
    // assignments use project-memberships.json, shared by the sidebar and turns.
    const portable = threadId ? readJson(this.file("conversation-projects.json"), {}) : {};
    if (threadId && own(portable, threadId)) {
      const membership = portable[threadId] as Membership;
      if (membership.resolution !== "unresolved") {
        if (membership.resolution !== "ambiguous") this.assign(threadId, membership.projectId);
        return { ...membership, ...resolve(membership.projectId, membership.resolution) };
      }
    }
    const legacy = threadId ? readJson(this.file("thread-projects.json"), {}) : {};
    const folder = threadId && own(legacy, threadId) ? legacy[threadId] : cwd && worktrees[cwd] ? worktrees[cwd].project : cwd;
    if (typeof folder !== "string") return { projectId: null, resolution: "unresolved" };
    // Historical ownership protects unread chats when projects share a source,
    // or when their original project has been removed.
    if (own(state.folders, folder)) {
      const project = records.find(p => p.id === state.folders[folder] && p.folders.includes(folder));
      if (threadId) this.assign(threadId, project?.id ?? null);
      return { projectId: project?.id ?? null, resolution: "inferred" };
    }
    const membership = inferMembership(records, folder, worktrees);
    if (threadId && membership.projectId) this.assign(threadId, membership.projectId);
    return membership;
  }
  projectFor(threadId: string | null, cwd: string | null, worktrees: Record<string, { project: string }> = {}): PortableProjectRecord | null {
    const membership = this.membership(threadId, cwd ?? undefined, worktrees);
    return this.list().find(p => p.id === membership.projectId) ?? null;
  }
}
