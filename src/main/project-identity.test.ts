import test from "node:test";
import assert from "node:assert/strict";
import {
  realpathSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assignMembership,
  inferMembership,
  membershipFor,
  projectRecord,
  readProjects,
} from "./project-identity";
test("migration persists identities once and preserves all existing presentation", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "projects-"));
  try {
    const file = join(dir, "projects.json");
    writeFileSync(
      file,
      JSON.stringify([
        "/work/old",
        {
          name: "Product",
          folders: ["/work/a", "/work/b"],
          primary: "/work/b",
          icon: "star",
          color: "red",
        },
      ]),
    );
    const first = readProjects(file);
    const bytes = readFileSync(file, "utf8");
    assert.deepEqual(readProjects(file), first);
    assert.equal(readFileSync(file, "utf8"), bytes);
    const p = first[1];
    const edited = projectRecord(
      {
        ...p,
        name: "Renamed",
        folders: [...p.folders].reverse(),
        primary: "/work/a",
      },
      p,
    );
    assert.equal(edited.id, p.id);
    assert.equal(
      edited.sources.find((s) => s.path === "/work/b")!.id,
      p.sources[1].id,
    );
    assert.equal(edited.icon, "star");
    assert.equal(edited.color, "red");
    assert.equal(inferMembership([edited], "/work/b").projectId, p.id);
    assert.equal(
      inferMembership([edited], "/work/a/wt", {
        "/work/a/wt": { project: "/work/b" },
      }).projectId,
      p.id,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("overlapping legacy paths remain ambiguous until explicitly resolved; null remains regular", () => {
  const a = projectRecord("/work");
  const b = projectRecord("/work/a");
  assert.equal(inferMembership([a, b], "/work/a").resolution, "ambiguous");
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "membership-"));
  try {
    const f = join(dir, "members.json");
    assert.equal(
      membershipFor(f, "thread", [a, b], "/work/a").resolution,
      "ambiguous",
    );
    assignMembership(f, "thread", b.id);
    assert.equal(
      membershipFor(f, "thread", [a, b], "/elsewhere").projectId,
      b.id,
    );
    assignMembership(f, "thread", null);
    assert.equal(membershipFor(f, "thread", [a, b], "/work/a").projectId, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cold resume without cwd does not persist an incorrect regular membership", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "cold-membership-"));
  try {
    const project = projectRecord("/repo");
    const file = join(dir, "membership.json");
    assert.equal(
      membershipFor(file, "thread", [project]).resolution,
      "unresolved",
    );
    assert.equal(
      membershipFor(file, "thread", [project], "/repo").projectId,
      project.id,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("conversation IDs cannot resolve through or mutate Object.prototype", () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "membership-keys-"));
  try {
    const file = join(dir, "membership.json");
    assert.equal(
      membershipFor(file, "constructor", []).resolution,
      "unresolved",
    );
    assignMembership(file, "__proto__", null);
    assignMembership(file, "other", "project");
    assert.equal(membershipFor(file, "__proto__", []).projectId, null);
    assert.equal(membershipFor(file, "other", []).projectId, "project");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
