import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicJson, locked, readJson } from "./atomic-store";
import {
  identifier,
  validateManifest,
  sameOwner,
  type EnvironmentManifest,
  type SettingsScope,
  type Owner,
} from "./environment";
export type SignIn = {
  provenance: "platform_device" | "api_key";
  keyFingerprint: string;
  owner: Owner | null;
};
export function keyFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
export function cloudEligible(auth: SignIn | null, key: string): boolean {
  return (
    !!auth &&
    auth.provenance === "platform_device" &&
    auth.keyFingerprint === keyFingerprint(key) &&
    !!auth.owner
  );
}
export type Binding = {
  threadId: string;
  owner: Owner;
  projectId: string | null;
  state: "local" | "preparing_cloud" | "cloud" | "preparation_failed";
  attemptId: string | null;
  cloudConversationId: string | null;
  cursor: number;
  error: string | null;
};
export interface RemoteTransport {
  request(
    binding: Binding,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;
  decide(
    binding: Binding,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<void>;
  environment(
    binding: Binding,
    manifest: EnvironmentManifest,
    expectedRevision: number,
  ): Promise<void>;
  events(
    binding: Binding,
    after: number,
    signal: AbortSignal,
  ): AsyncIterable<{ cursor: number; payload: unknown }>;
}
/** This store is an adapter boundary, not a Relay implementation. No adapter is shipped in v1. */
export class CloudBindings {
  private consumers = new Map<string, Promise<unknown>>();
  constructor(private readonly root: string) {}
  private file(thread: string): string {
    identifier(thread);
    return join(this.root, `${thread}.json`);
  }
  read(thread: string): Binding | null {
    const b = readJson<Binding | null>(this.file(thread), null);
    if (b) {
      identifier(b.owner.organizationId);
      identifier(b.owner.memberId);
      if (
        b.threadId !== thread ||
        !["local", "preparing_cloud", "cloud", "preparation_failed"].includes(
          b.state,
        ) ||
        !Number.isSafeInteger(b.cursor) ||
        b.cursor < 0 ||
        (b.state === "cloud" && !b.cloudConversationId)
      )
        throw new Error(
          "Invalid persisted cloud binding; refusing local execution",
        );
    }
    if (b?.projectId !== null && b?.projectId !== undefined)
      identifier(b.projectId);
    if (b?.cloudConversationId) identifier(b.cloudConversationId);
    if (b?.attemptId) identifier(b.attemptId);
    if (b && b.state !== "local" && !b.attemptId)
      throw new Error("Cloud handoff attempt identity missing");
    return b;
  }
  prepare(
    thread: string,
    owner: Owner,
    projectId: string | null,
    active: boolean,
  ): Binding {
    identifier(owner.organizationId);
    identifier(owner.memberId);
    if (projectId !== null) identifier(projectId);
    return locked(this.file(thread), () => {
      const old = this.read(thread);
      if (
        active ||
        (old && old.state !== "local") ||
        (old && !sameOwner(old.owner, owner))
      )
        throw new Error(
          "Handoff unavailable: active, already bound, or owned by another account",
        );
      const b: Binding = {
        threadId: thread,
        owner,
        projectId,
        state: "preparing_cloud",
        attemptId: randomUUID(),
        cloudConversationId: null,
        cursor: 0,
        error: null,
      };
      atomicJson(this.file(thread), b);
      return b;
    });
  }
  complete(thread: string, attempt: string, cloudId: string): void {
    identifier(cloudId);
    this.change(thread, (b) => {
      if (b.state !== "preparing_cloud" || b.attemptId !== attempt)
        throw new Error("Stale handoff completion");
      return {
        ...b,
        state: "cloud",
        cloudConversationId: cloudId,
        error: null,
      };
    });
  }
  fail(thread: string, attempt: string, error: string): void {
    this.change(thread, (b) => {
      if (b.state !== "preparing_cloud" || b.attemptId !== attempt)
        throw new Error("Stale handoff failure");
      return { ...b, state: "preparation_failed", error };
    });
  }
  /** Only after Relay confirms the prepare transaction was aborted; a network error is insufficient. */
  recoverLocal(thread: string, confirmedAbortedAttempt: string): void {
    this.change(thread, (b) => {
      if (
        b.state !== "preparation_failed" ||
        b.attemptId !== confirmedAbortedAttempt
      )
        throw new Error("Cannot reverse cloud binding");
      return { ...b, state: "local", error: null };
    });
  }
  async consume(
    thread: string,
    cursor: number,
    apply: (payload: unknown) => Promise<void>,
    payload: unknown,
  ): Promise<boolean> {
    const previous = this.consumers.get(thread) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        const b = this.read(thread);
        if (!b || b.state !== "cloud")
          throw new Error("Cloud binding required");
        if (!Number.isSafeInteger(cursor) || cursor <= 0)
          throw new Error("Invalid event cursor");
        if (cursor <= b.cursor) return false;
        if (cursor !== b.cursor + 1)
          throw new Error("EVENT_GAP: fetch snapshot before continuing");
        // The sink must be idempotent by conversation/cursor for crash replay.
        await apply(payload);
        this.change(thread, (current) => {
          if (current.cursor !== b.cursor)
            throw new Error("Concurrent event consumer; reconnect");
          return { ...current, cursor };
        });
        return true;
      });
    this.consumers.set(thread, operation);
    try {
      return await operation;
    } finally {
      if (this.consumers.get(thread) === operation)
        this.consumers.delete(thread);
    }
  }
  affected(owner: Owner, scope: SettingsScope): Binding[] {
    let files: string[];
    try {
      files = readdirSync(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.read(f.slice(0, -5))!)
      .filter(
        (b) =>
          b &&
          sameOwner(b.owner, owner) &&
          b.state !== "local" &&
          (scope.kind === "global" ||
            (scope.kind === "project"
              ? b.projectId === scope.projectId
              : b.threadId === scope.conversationId)),
      );
  }
  private change(thread: string, f: (b: Binding) => Binding): void {
    locked(this.file(thread), () => {
      const b = this.read(thread);
      if (!b) throw new Error("Binding missing");
      atomicJson(this.file(thread), f(b));
    });
  }
}
export class ConversationRouter {
  constructor(
    private readonly bindings: CloudBindings,
    private readonly owner: () => Owner | null,
    private readonly remote: RemoteTransport | null = null,
  ) {}
  async request(
    method: string,
    params: Record<string, unknown>,
    local: () => Promise<unknown>,
  ): Promise<unknown> {
    const id = typeof params.threadId === "string" ? params.threadId : null;
    if (!id) return local();
    const b = this.bindings.read(id);
    if (!b) return local();
    const owner = this.owner();
    if (!owner || !sameOwner(owner, b.owner))
      throw new Error(
        "Cloud conversation belongs to another organization/member",
      );
    if (b.state === "local") return local();
    if (b.state !== "cloud")
      throw new Error(
        "Handoff unresolved; execution is paused. Retry or confirm preparation abort.",
      );
    if (!this.remote)
      throw new Error(
        "CLOUD_ADAPTER_UNAVAILABLE: remote execution required; local fallback is disabled",
      );
    if (params.dynamicTools)
      throw new Error(
        "Local dynamic tools cannot be registered on a cloud conversation",
      );
    if (
      method === "turn/start" &&
      Array.isArray(params.input) &&
      params.input.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ["localImage", "mention"].includes(
            String((item as { type?: unknown }).type),
          ),
      )
    )
      throw new Error(
        "Cloud attachments require approved portable artifact references; local paths are not transferred",
      );
    return this.remote.request(b, method, params);
  }
  async reconnect(
    thread: string,
    apply: (payload: unknown) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    const b = this.bindings.read(thread);
    const owner = this.owner();
    if (!b || b.state !== "cloud" || !this.remote)
      throw new Error("CLOUD_ADAPTER_UNAVAILABLE");
    if (!owner || !sameOwner(owner, b.owner)) throw new Error("Owner mismatch");
    for await (const event of this.remote.events(b, b.cursor, signal)) {
      if (signal.aborted) return;
      const currentOwner = this.owner();
      if (!currentOwner || !sameOwner(currentOwner, b.owner))
        throw new Error("Owner changed during event stream");
      await this.bindings.consume(thread, event.cursor, apply, event.payload);
    }
  }
  async environment(
    thread: string,
    manifest: EnvironmentManifest,
    expected: number,
  ): Promise<void> {
    const b = this.bindings.read(thread);
    if (!b || b.state !== "cloud" || !this.remote)
      throw new Error("CLOUD_ADAPTER_UNAVAILABLE");
    const owner = this.owner();
    if (
      !owner ||
      !sameOwner(owner, b.owner) ||
      !sameOwner(owner, manifest.owner)
    )
      throw new Error("Owner mismatch");
    validateManifest(manifest);
    if (
      manifest.scope.kind !== "conversation" ||
      manifest.scope.conversationId !== thread ||
      manifest.scope.projectId !== b.projectId
    )
      throw new Error("Cloud environment scope does not match its binding");
    if (
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      manifest.revision !== expected + 1
    )
      throw new Error("Invalid environment base revision");
    await this.remote.environment(b, manifest, expected);
  }
  async decide(
    thread: string,
    approval: string,
    decision: "approve" | "deny",
  ): Promise<void> {
    const b = this.bindings.read(thread);
    const owner = this.owner();
    if (!b || b.state !== "cloud" || !this.remote)
      throw new Error("CLOUD_ADAPTER_UNAVAILABLE");
    if (!owner || !sameOwner(owner, b.owner)) throw new Error("Owner mismatch");
    await this.remote.decide(b, approval, decision);
  }
}
