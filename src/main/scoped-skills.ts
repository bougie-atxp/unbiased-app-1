import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { noSymlinks } from "./atomic-store";
import {
  scopeKey,
  validateManifest,
  type Owner,
  type SettingsScope,
} from "./environment";
import { EnvironmentStore } from "./environment-store";
export const SCOPED_SKILL_LIMITATION =
  "Saved for this scope. Activation is unavailable: pinned engine has no verified isolated per-thread skill roots. Existing folder-scoped skills are unchanged.";
/** v1 accepts a single reviewed Markdown file, never a recursive directory or executable assets. */
export function installScopedSkill(
  root: string,
  store: EnvironmentStore,
  owner: Owner,
  scope: SettingsScope,
  source: string,
  name: string,
  expectedRevision: number,
) {
  const previous = store.read(owner, scope);
  const revision = previous?.revision ?? 0;
  if (expectedRevision !== revision) throw new Error("REVISION_CONFLICT");
  const ancestors: SettingsScope[] =
    scope.kind === "global" ? [] : [{ kind: "global" }];
  if (scope.kind === "conversation" && scope.projectId)
    ancestors.push({ kind: "project", projectId: scope.projectId });
  const inherited = ancestors
    .flatMap((parent) => store.read(owner, parent)?.skills ?? [])
    .filter((skill) => skill.name === name)
    .at(-1);
  const skillId =
    previous?.skills.find((s) => s.name === name)?.id ??
    inherited?.id ??
    randomUUID();
  noSymlinks(source);
  const info = lstatSync(source);
  if (!info.isFile() || info.size > 64 * 1024 || !source.endsWith(".md"))
    throw new Error(
      "Choose one reviewed Markdown file, at most 64 KiB; directories/scripts are not portable in v1",
    );
  const data = readFileSync(source);
  const digest = createHash("sha256").update(data).digest("hex");
  const manifest = validateManifest({
    schemaVersion: 1,
    owner,
    scope,
    revision: revision + 1,
    skills: [
      ...(previous?.skills.filter((s) => s.id !== skillId) ?? []),
      {
        id: skillId,
        name,
        origin: scope,
        enabled: true,
        version: digest,
        digest,
        path: `skills/${skillId}/SKILL.md`,
      },
    ],
    connectors: previous?.connectors ?? [],
    repositories: previous?.repositories ?? [],
  });
  const artifact = join(
    root,
    owner.organizationId,
    owner.memberId,
    scopeKey(scope),
    digest,
    "skills",
    skillId,
    "SKILL.md",
  );
  noSymlinks(artifact);
  mkdirSync(dirname(artifact), { recursive: true, mode: 0o700 });
  const temp = `${artifact}.${randomUUID()}.tmp`;
  writeFileSync(temp, data, { flag: "wx", mode: 0o600 });
  try {
    renameSync(temp, artifact);
  } finally {
    rmSync(temp, { force: true });
  }
  // Artifact first; settings are authoritative only after the CAS succeeds. Orphans are inert.
  const saved = store.write(manifest, expectedRevision);
  return {
    ok: true,
    manifest: saved,
    path: artifact,
    activation: "unavailable" as const,
    note: SCOPED_SKILL_LIMITATION,
  };
}
