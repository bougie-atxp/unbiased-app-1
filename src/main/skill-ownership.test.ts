import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insideSkillRoot, installOwnedSkill, SkillOwnershipStore } from "./skill-ownership";

function fixture(t: test.TestContext) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "skill-ownership-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "ownership.json");
  return { dir, file, store: new SkillOwnershipStore(file) };
}

test("installation persists the chosen global or project ID ownership alongside skill files", t => {
  const { dir, file, store } = fixture(t);
  const source = join(dir, "source");
  mkdirSync(source);
  writeFileSync(join(source, "SKILL.md"), "# Review\n");
  writeFileSync(join(source, "helper.py"), "# fixture\n");
  const local = installOwnedSkill(source, join(dir, "repo/.codex/skills"), "review", { scope: "project", projectId: "project-a" }, store);
  const global = installOwnedSkill(join(source, "SKILL.md"), join(dir, "global"), "review", { scope: "global" }, store);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(saved[local], { scope: "project", projectId: "project-a" });
  assert.deepEqual(saved[global], { scope: "global" });
  assert.equal(readFileSync(join(local, "../helper.py"), "utf8"), "# fixture\n");
  assert.equal(readFileSync(global, "utf8"), "# Review\n");
});

test("restart, project rename and a shared source never reassign an installed skill", t => {
  const { file, store } = fixture(t);
  const path = "/repo/.codex/skills/review/SKILL.md";
  store.assign(path, { scope: "project", projectId: "original" });
  const reopened = new SkillOwnershipStore(file);
  const projects = [{ id: "new-project", folders: ["/repo"] }, { id: "original", name: "Renamed", folders: ["/repo"] }];
  assert.deepEqual(reopened.ownership(path, projects, [], "repo"), { scope: "project", projectId: "original" });
  // Removal of the project must not silently turn its skills into global skills.
  assert.deepEqual(reopened.ownership(path, projects.slice(0, 1), [], "repo"), { scope: "project", projectId: "original" });
});

test("existing unambiguous repository skills gain stable ownership without modifying their files", t => {
  const { dir, file, store } = fixture(t);
  const path = join(dir, "repo/.agents/skills/check/SKILL.md");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "unchanged");
  assert.deepEqual(store.ownership(path, [{ id: "p", folders: [join(dir, "repo")] }], [], "repo"), { scope: "project", projectId: "p" });
  assert.equal(readFileSync(path, "utf8"), "unchanged");
  assert.deepEqual(new SkillOwnershipStore(file).ownership(path, [], [], "repo"), { scope: "project", projectId: "p" });
});

test("ambiguous and unattached folder skills are not claimed by whichever project is open", t => {
  const { store } = fixture(t);
  const path = "/repo/.codex/skills/review/SKILL.md";
  const shared = [{ id: "a", folders: ["/repo"] }, { id: "b", folders: ["/repo"] }];
  assert.deepEqual(store.ownership(path, shared, [], "repo"), { scope: "folder" });
  assert.deepEqual(store.ownership(path, shared.reverse(), [], "repo"), { scope: "folder" });
  assert.deepEqual(store.ownership("/unregistered/.codex/skills/s/SKILL.md", [], [], "repo"), { scope: "folder" });
});

test("global roots and external user/system skills stay global; root-prefix lookalikes do not match", t => {
  const { store } = fixture(t);
  assert.deepEqual(store.ownership("/global/check/SKILL.md", [], ["/global"], "user"), { scope: "global" });
  assert.deepEqual(store.ownership("/external/check/SKILL.md", [], [], "system"), { scope: "global" });
  assert.equal(insideSkillRoot("/repo/.codex/skills", "/repo/.codex/skills-foreign/check/SKILL.md"), false);
});

test("failed metadata persistence rolls back only the new installation and preserves existing skills", t => {
  const { dir, file, store } = fixture(t);
  const source = join(dir, "SKILL.md");
  writeFileSync(source, "fixture");
  writeFileSync(file, "corrupt JSON");
  const root = join(dir, "global");
  assert.throws(() => installOwnedSkill(source, root, "new", { scope: "global" }, store));
  assert.equal(existsSync(join(root, "new")), false);
  mkdirSync(join(root, "existing"));
  writeFileSync(join(root, "existing/SKILL.md"), "keep");
  assert.throws(() => installOwnedSkill(source, root, "existing", { scope: "global" }, store), /already there/);
  assert.equal(readFileSync(join(root, "existing/SKILL.md"), "utf8"), "keep");
});

test("removing an installed skill forgets its ownership so reinstalling can choose another scope", t => {
  const { file, store } = fixture(t);
  const path = "/repo/.codex/skills/review/SKILL.md";
  store.assign(path, { scope: "project", projectId: "old" });
  store.forget(path);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(file, "utf8")), path), false);
  store.assign(path, { scope: "project", projectId: "new" });
  assert.deepEqual(store.ownership(path, [], [], "repo"), { scope: "project", projectId: "new" });
});
