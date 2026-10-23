import { locked } from "./atomic-store";
import { ConversationLineage } from "./conversation-lineage";
import test from "node:test";
import assert from "node:assert/strict";
import {
  realpathSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exportConnector,
  resolveEnvironment,
  validateManifest,
  type EnvironmentManifest,
} from "./environment";
import { EnvironmentStore, TurnEnvironments } from "./environment-store";
import { installScopedSkill } from "./scoped-skills";
const fixture = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../contracts/environment/fixtures/valid.json",
    ),
    "utf8",
  ),
);
test("shared contract fixtures accept and reject the same documents", () => {
  assert.equal(validateManifest(fixture).revision, 1);
  const cases = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "../../contracts/environment/fixtures/invalid.json",
      ),
      "utf8",
    ),
  );
  for (const c of cases)
    assert.throws(() => validateManifest(c.manifest), c.name);
  assert.throws(() =>
    validateManifest({ ...fixture, padding: "x".repeat(300000) }),
  );
});
test("safe connector export rejects every arbitrary secret channel", () => {
  for (const field of [
    "args",
    "env",
    "headers",
    "oauthClientSecret",
    "command",
    "script",
    "config",
    "token",
  ])
    assert.throws(() =>
      exportConnector(
        { name: "docs", url: "https://example.com/mcp", [field]: "sensitive" },
        "docs",
      ),
    );
  for (const url of [
    "https://u:p@example.com/mcp",
    "https://example.com/mcp?token=x",
    "https://example.com/secret-token",
    "http://example.com/mcp",
  ])
    assert.throws(() => exportConnector({ name: "docs", url }, "docs"));
  assert.deepEqual(
    exportConnector(
      { name: "docs", url: "https://example.com/mcp", enabled: false },
      "docs",
    ),
    {
      id: "docs",
      name: "docs",
      origin: { kind: "global" },
      endpoint: "https://example.com/mcp",
      enabled: false,
    },
  );
});
test("precedence preserves explicit disablement, checks ownership and projects, and shares project settings across conversations", () => {
  const global = validateManifest({
    ...fixture,
    scope: { kind: "global" },
    skills: [],
    connectors: [
      { ...fixture.connectors[0], origin: { kind: "global" }, enabled: true },
    ],
  });
  const project = validateManifest({
    ...fixture,
    scope: { kind: "project", projectId: "project-1" },
  });
  const override = validateManifest({
    ...fixture,
    skills: [{ ...fixture.skills[0], origin: fixture.scope, enabled: false }],
    connectors: [],
  });
  assert.equal(
    resolveEnvironment([global, project, override], fixture.scope).skills[0]
      .enabled,
    false,
  );
  assert.equal(
    resolveEnvironment([global, project], {
      kind: "conversation",
      projectId: "project-1",
      conversationId: "thread-2",
    }).skills[0].enabled,
    true,
  );
  assert.throws(() =>
    resolveEnvironment(
      [
        global,
        { ...project, owner: { ...project.owner, organizationId: "other" } },
      ],
      fixture.scope,
    ),
  );
  assert.throws(() =>
    resolveEnvironment([global, project], {
      kind: "conversation",
      projectId: "other",
      conversationId: "thread-2",
    }),
  );
});
test("authoritative writes are CAS, separate owners, and require tombstones", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "environments-"));
  try {
    const store = new EnvironmentStore(dir);
    store.write(fixture, 0);
    assert.throws(() => store.write(fixture, 0), /CONFLICT/);
    assert.throws(
      () => store.write({ ...fixture, revision: 2, skills: [] }, 1),
      /enabled:false/,
    );
    const disabled = store.write(
      {
        ...fixture,
        revision: 2,
        skills: [{ ...fixture.skills[0], enabled: false }],
      },
      1,
    );
    assert.equal(disabled.revision, 2);
    assert.equal(
      store.read(
        { organizationId: "other", memberId: "user-1" },
        fixture.scope,
      ),
      null,
    );
    const turns = new TurnEnvironments();
    turns.update("a", fixture);
    assert.equal(turns.begin("a")!.revision, 1);
    turns.update("a", disabled);
    assert.equal(turns.snapshot("a")!.revision, 1);
    turns.update("b", fixture);
    turns.begin("b");
    turns.end("a");
    assert.equal(turns.begin("a")!.revision, 2);
    assert.equal(turns.snapshot("b")!.revision, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("scoped installation writes Markdown and revision immediately, rejects scripts, symlinks and oversized files", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "skills-"));
  try {
    const store = new EnvironmentStore(join(dir, "settings"));
    const source = join(dir, "SKILL.md");
    writeFileSync(source, "# Review\n");
    const saved = installScopedSkill(
      join(dir, "artifacts"),
      store,
      fixture.owner,
      fixture.scope,
      source,
      "review",
      0,
    );
    assert.equal(saved.activation, "unavailable");
    assert.equal(store.read(fixture.owner, fixture.scope)!.revision, 1);
    const link = join(dir, "link.md");
    symlinkSync(source, link);
    assert.throws(
      () =>
        installScopedSkill(
          dir,
          store,
          fixture.owner,
          fixture.scope,
          link,
          "other",
          1,
        ),
      /symlink/,
    );
    writeFileSync(source, "x".repeat(65537));
    assert.throws(
      () =>
        installScopedSkill(
          dir,
          store,
          fixture.owner,
          fixture.scope,
          source,
          "other",
          1,
        ),
      /64 KiB/,
    );
    assert.throws(() =>
      installScopedSkill(
        dir,
        store,
        fixture.owner,
        fixture.scope,
        dir,
        "other",
        1,
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("side chats and subagents share root settings without copying grants or confusing projects", () => {
  const lineage = new ConversationLineage();
  lineage.register("side-a", "root-a");
  lineage.register("agent", "side-a");
  lineage.register("side-b", "root-b");
  assert.equal(lineage.root("agent"), "root-a");
  assert.equal(lineage.root("side-b"), "root-b");
  assert.throws(() => lineage.register("root-a", "agent"), /cycle/);
  // A new app instance restores durable project membership, not ephemeral grants/ancestry.
  assert.equal(new ConversationLineage().root("side-a"), "side-a");
});

test("a concurrent writer cannot overwrite the authoritative settings file", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "settings-lock-"));
  try {
    const store = new EnvironmentStore(dir);
    store.write(fixture, 0);
    const file = join(
      dir,
      fixture.owner.organizationId,
      fixture.owner.memberId,
      `conversation-${fixture.scope.conversationId}.json`,
    );
    locked(file, () =>
      assert.throws(
        () => store.write({ ...fixture, revision: 2 }, 1),
        /STORE_BUSY/,
      ),
    );
    assert.equal(store.read(fixture.owner, fixture.scope)!.revision, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project installation overrides the inherited skill identity without changing other conversations", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "override-install-"));
  try {
    const store = new EnvironmentStore(join(dir, "settings"));
    const source = join(dir, "SKILL.md");
    writeFileSync(source, "# Global\n");
    const global = installScopedSkill(
      join(dir, "artifacts"),
      store,
      fixture.owner,
      { kind: "global" },
      source,
      "review",
      0,
    ).manifest;
    writeFileSync(source, "# Project\n");
    const project = installScopedSkill(
      join(dir, "artifacts"),
      store,
      fixture.owner,
      { kind: "project", projectId: "project-1" },
      source,
      "review",
      0,
    ).manifest;
    assert.equal(global.skills[0].id, project.skills[0].id);
    assert.notEqual(global.skills[0].digest, project.skills[0].digest);
    assert.equal(
      resolveEnvironment([global, project], fixture.scope).skills[0].origin
        .kind,
      "project",
    );
    assert.equal(
      store.read(fixture.owner, {
        kind: "conversation",
        projectId: "project-1",
        conversationId: "other",
      }),
      null,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("engine exit releases frozen turns so the same conversation can resume", () => {
  const turns = new TurnEnvironments();
  turns.update("a", fixture);
  turns.begin("a");
  turns.reset();
  turns.update("a", { ...fixture, revision: 2 });
  assert.equal(turns.begin("a")!.revision, 2);
});
