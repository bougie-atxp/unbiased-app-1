/** Portable data only. Credentials, executable arguments, scripts and host paths have no representation. */
export type Owner = { organizationId: string; memberId: string };
export type SettingsScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "conversation"; projectId: string | null; conversationId: string };
export type SkillDefinition = {
  id: string;
  name: string;
  origin: SettingsScope;
  enabled: boolean;
  version: string;
  digest: string;
  path: string;
};
export type ConnectorDefinition = {
  id: string;
  name: string;
  origin: SettingsScope;
  endpoint: string;
  enabled: boolean;
  credentialRef?: string;
};
export type RepositoryDefinition = {
  sourceId: string;
  repositoryId: string | null;
  checkoutId: string;
  kind: "git" | "directory";
  displayName: string;
  access: "read" | "write";
  branch?: string;
  commit?: string;
  remote?: string;
  worktreeName?: string;
};
export type EnvironmentManifest = {
  schemaVersion: 1;
  owner: Owner;
  scope: SettingsScope;
  revision: number;
  skills: SkillDefinition[];
  connectors: ConnectorDefinition[];
  repositories: RepositoryDefinition[];
};
export const MAX_MANIFEST_BYTES = 256 * 1024;
export function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("Invalid portable identifier");
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected object");
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new Error(`Unsupported field: ${key}`);
  return value as Record<string, unknown>;
}
export function validateScope(value: unknown): SettingsScope {
  const s = object(value, ["kind", "projectId", "conversationId"]);
  if (s.kind === "global") {
    if (Object.keys(s).length !== 1)
      throw new Error("Global scope cannot name a project/conversation");
  } else if (s.kind === "project") {
    identifier(s.projectId);
    if (s.conversationId !== undefined)
      throw new Error("Project scope cannot name a conversation");
  } else if (s.kind === "conversation") {
    identifier(s.conversationId);
    if (s.projectId !== null) identifier(s.projectId);
  } else throw new Error("Invalid settings scope");
  return s as SettingsScope;
}
export function scopeKey(scope: SettingsScope): string {
  return scope.kind === "global"
    ? "global"
    : scope.kind === "project"
      ? `project-${scope.projectId}`
      : `conversation-${scope.conversationId}`;
}
export function sameOwner(a: Owner, b: Owner): boolean {
  return a.organizationId === b.organizationId && a.memberId === b.memberId;
}
export function scopeContains(
  parent: SettingsScope,
  child: SettingsScope,
): boolean {
  if (parent.kind === "global") return true;
  if (parent.kind === "project")
    return child.kind !== "global" && child.projectId === parent.projectId;
  return (
    child.kind === "conversation" &&
    child.conversationId === parent.conversationId &&
    child.projectId === parent.projectId
  );
}
/** Only plain HTTPS MCP endpoints are portable in v1. Arbitrary URLs can encode credentials. */
export function safeEndpoint(value: unknown): asserts value is string {
  if (typeof value !== "string")
    throw new Error("Connector endpoint is required");
  // Validate the original spelling: URL() normalizes dot segments, default ports
  // and empty userinfo, which could otherwise hide unsupported credential data.
  const endpoint =
    /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/(?:mcp|sse)?)?$/;
  if (!endpoint.test(value))
    throw new Error(
      "Portable connector requires a canonical lowercase HTTPS DNS endpoint with /mcp, /sse or /; no credentials, query, fragment, port or normalized path segments",
    );
}
function text(v: unknown, max = 128): void {
  if (
    typeof v !== "string" ||
    !v.length ||
    v.length > max ||
    /[\x00-\x1f\x7f]/.test(v)
  )
    throw new Error("Invalid bounded text");
}
function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    throw new Error("Invalid or oversized list");
  return v;
}
function unique(items: unknown[], field: string): void {
  const seen = new Set();
  for (const item of items) {
    const id = (item as Record<string, unknown>)[field];
    if (seen.has(id)) throw new Error(`Duplicate ${field}`);
    seen.add(id);
  }
}
export function validateManifest(value: unknown): EnvironmentManifest {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_MANIFEST_BYTES)
    throw new Error("Environment manifest is too large");
  const m = object(value, [
    "schemaVersion",
    "owner",
    "scope",
    "revision",
    "skills",
    "connectors",
    "repositories",
  ]);
  if (m.schemaVersion !== 1)
    throw new Error("Unsupported environment schema version");
  const owner = object(m.owner, ["organizationId", "memberId"]);
  identifier(owner.organizationId);
  identifier(owner.memberId);
  const scope = validateScope(m.scope);
  if (!Number.isSafeInteger(m.revision) || (m.revision as number) < 1)
    throw new Error("Invalid environment revision");
  const skills = list(m.skills, 200);
  for (const raw of skills) {
    const s = object(raw, [
      "id",
      "name",
      "origin",
      "enabled",
      "version",
      "digest",
      "path",
    ]);
    identifier(s.id);
    identifier(s.name);
    text(s.version);
    const origin = validateScope(s.origin);
    if (!scopeContains(origin, scope))
      throw new Error("Skill origin is outside environment scope");
    if (
      typeof s.enabled !== "boolean" ||
      typeof s.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(s.digest)
    )
      throw new Error("Invalid skill state/digest");
    if (
      typeof s.path !== "string" ||
      !/^skills\/[A-Za-z0-9_-]{1,128}\/SKILL\.md$/.test(s.path)
    )
      throw new Error("Skill path must be portable skills/<id>/SKILL.md");
    if (s.path !== `skills/${s.id}/SKILL.md`)
      throw new Error("Skill path must match identity");
  }
  unique(skills, "id");
  unique(skills, "name");
  const connectors = list(m.connectors, 100);
  for (const raw of connectors) {
    const c = object(raw, [
      "id",
      "name",
      "origin",
      "endpoint",
      "enabled",
      "credentialRef",
    ]);
    identifier(c.id);
    identifier(c.name);
    if ((c.name as string).length > 24)
      throw new Error("Connector name exceeds engine limit");
    if (!scopeContains(validateScope(c.origin), scope))
      throw new Error("Connector origin outside scope");
    safeEndpoint(c.endpoint);
    if (typeof c.enabled !== "boolean")
      throw new Error("Invalid connector enabled state");
    if (c.credentialRef !== undefined) identifier(c.credentialRef);
  }
  unique(connectors, "id");
  unique(connectors, "name");
  const repos = list(m.repositories, 50);
  for (const raw of repos) {
    const r = object(raw, [
      "sourceId",
      "repositoryId",
      "checkoutId",
      "kind",
      "displayName",
      "access",
      "branch",
      "commit",
      "remote",
      "worktreeName",
    ]);
    identifier(r.sourceId);
    identifier(r.checkoutId);
    text(r.displayName);
    if (r.kind === "git") identifier(r.repositoryId);
    else if (r.kind !== "directory" || r.repositoryId !== null)
      throw new Error("Invalid repository kind");
    if (r.access !== "read" && r.access !== "write")
      throw new Error("Explicit repository access is required");
    for (const field of ["branch", "worktreeName"])
      if (r[field] !== undefined) text(r[field], 256);
    if (
      r.commit !== undefined &&
      (typeof r.commit !== "string" || !/^[a-f0-9]{40,64}$/.test(r.commit))
    )
      throw new Error("Invalid Git commit");
    if (r.remote !== undefined) {
      const u = new URL(r.remote as string);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        throw new Error(
          "Portable Git remote must be HTTPS without credentials",
        );
    }
  }
  unique(repos, "sourceId");
  unique(repos, "checkoutId");
  return m as EnvironmentManifest;
}
/** Explicitly convert supported local definitions; never serialize arbitrary args/env or inline config. */
export function exportConnector(
  raw: unknown,
  id: string,
  origin: SettingsScope = { kind: "global" },
): ConnectorDefinition {
  const c = object(raw, [
    "name",
    "url",
    "enabled",
    "bearerTokenEnvVar",
    "oauthClientId",
    "scopes",
    "credentialRef",
  ]);
  identifier(id);
  identifier(c.name);
  safeEndpoint(c.url);
  if (c.enabled !== undefined && typeof c.enabled !== "boolean")
    throw new Error("Invalid connector enabled state");
  // Credential metadata is intentionally not inferred from arbitrary local values.
  if (
    c.bearerTokenEnvVar !== undefined ||
    c.oauthClientId !== undefined ||
    c.scopes !== undefined
  )
    throw new Error(
      "Credential configuration needs an explicit portable credential reference; local auth is not exportable",
    );
  if (c.credentialRef !== undefined) identifier(c.credentialRef);
  return {
    id,
    name: c.name as string,
    origin: validateScope(origin),
    endpoint: c.url,
    enabled: c.enabled !== false,
    ...(c.credentialRef ? { credentialRef: c.credentialRef as string } : {}),
  };
}
/** Later entries, including disabled tombstones, replace earlier entries by stable ID. */
export function resolveEnvironment(
  layers: EnvironmentManifest[],
  target: SettingsScope,
): EnvironmentManifest {
  if (!layers.length) throw new Error("Global environment required");
  const owner = layers[0].owner;
  const skills = new Map<string, SkillDefinition>();
  const connectors = new Map<string, ConnectorDefinition>();
  let rank = -1;
  for (const layer of layers) {
    validateManifest(layer);
    const next = ["global", "project", "conversation"].indexOf(
      layer.scope.kind,
    );
    if (
      next <= rank ||
      !sameOwner(owner, layer.owner) ||
      !scopeContains(layer.scope, target)
    )
      throw new Error("Environment owner/scope/order mismatch");
    rank = next;
    for (const s of layer.skills) skills.set(s.id, s);
    for (const c of layer.connectors) connectors.set(c.id, c);
  }
  // Access and repository membership are never merged from a broader scope.
  return validateManifest({
    schemaVersion: 1,
    owner,
    scope: target,
    revision: layers.at(-1)!.revision,
    skills: [...skills.values()],
    connectors: [...connectors.values()],
    repositories: layers.at(-1)!.repositories,
  });
}
