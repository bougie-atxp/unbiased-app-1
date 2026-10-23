import { join } from "node:path";
import { atomicJson, locked, readJson } from "./atomic-store";
import {
  identifier,
  sameOwner,
  scopeKey,
  validateManifest,
  validateScope,
  type EnvironmentManifest,
  type Owner,
  type SettingsScope,
} from "./environment";

/** Every write is compare-and-swap. Disabled entries are retained as tombstones. */
export class EnvironmentStore {
  constructor(private readonly root: string) {}
  private file(owner: Owner, scope: SettingsScope): string {
    identifier(owner.organizationId);
    identifier(owner.memberId);
    validateScope(scope);
    return join(
      this.root,
      owner.organizationId,
      owner.memberId,
      `${scopeKey(scope)}.json`,
    );
  }
  read(owner: Owner, scope: SettingsScope): EnvironmentManifest | null {
    const raw = readJson<unknown>(this.file(owner, scope), null);
    if (raw === null) return null;
    const m = validateManifest(raw);
    if (!sameOwner(m.owner, owner) || !sameScope(m.scope, scope))
      throw new Error("Environment scope mismatch");
    return m;
  }
  write(
    input: EnvironmentManifest,
    expectedRevision: number,
  ): EnvironmentManifest {
    const m = validateManifest(input);
    const file = this.file(m.owner, m.scope);
    return locked(file, () => {
      const previous = this.read(m.owner, m.scope);
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        (previous?.revision ?? 0) !== expectedRevision ||
        m.revision !== expectedRevision + 1
      )
        throw new Error("REVISION_CONFLICT: reload settings before saving");
      // Deletions must be explicit tombstones so an older layer cannot resurrect an item.
      for (const field of ["skills", "connectors"] as const)
        for (const old of previous?.[field] ?? [])
          if (!m[field].some((entry) => entry.id === old.id))
            throw new Error("Use enabled:false to delete inherited settings");
      atomicJson(file, m);
      return m;
    });
  }
}
/** Thread revisions freeze at turn start; pending updates cannot replace an active snapshot. */
export class TurnEnvironments {
  private current = new Map<string, EnvironmentManifest>();
  private active = new Set<string>();
  private pending = new Map<string, EnvironmentManifest>();
  update(thread: string, manifest: EnvironmentManifest): void {
    const m = validateManifest(manifest);
    const before = this.pending.get(thread) ?? this.current.get(thread);
    if (before && (!sameIdentity(before, m) || m.revision <= before.revision))
      throw new Error("Stale or foreign thread environment");
    (this.active.has(thread) ? this.pending : this.current).set(
      thread,
      structuredClone(m),
    );
  }
  begin(thread: string): EnvironmentManifest | undefined {
    if (this.active.has(thread)) throw new Error("Turn already active");
    if (this.pending.has(thread)) {
      this.current.set(thread, this.pending.get(thread)!);
      this.pending.delete(thread);
    }
    this.active.add(thread);
    return this.snapshot(thread);
  }
  end(thread: string): void {
    this.active.delete(thread);
  }
  reset(): void {
    this.current.clear();
    this.active.clear();
    this.pending.clear();
  }
  snapshot(thread: string): EnvironmentManifest | undefined {
    const m = this.current.get(thread);
    return m && structuredClone(m);
  }
}
function sameIdentity(a: EnvironmentManifest, b: EnvironmentManifest): boolean {
  return (
    a.owner.organizationId === b.owner.organizationId &&
    a.owner.memberId === b.owner.memberId &&
    sameScope(a.scope, b.scope)
  );
}

function sameScope(a: SettingsScope, b: SettingsScope): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === "global" ||
      (b.kind !== "global" && a.projectId === b.projectId)) &&
    (a.kind !== "conversation" ||
      (b.kind === "conversation" && a.conversationId === b.conversationId))
  );
}
