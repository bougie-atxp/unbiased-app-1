import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore, type ProjectRecord } from "./project-store";

function fixture(t: test.TestContext, raw: unknown = []): { dir: string; store: ProjectStore } {
  const dir = mkdtempSync(join(tmpdir(), "project-identity-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "projects.json"), JSON.stringify(raw));
  return { dir, store: new ProjectStore(dir) };
}
function project(id: string, folders = ["/repo"]): ProjectRecord {
  return { id, name: id, folders, primary: folders[0], icon: "folder", color: null };
}

test("migrates both legacy formats once and retains existing memory and metadata", (t) => {
  const { dir, store } = fixture(t, ["/repo", { name: "Backend", primary: "/api", folders: ["/api", "/server"], icon: "flask", color: "red" }]);
  const records = store.list();
  assert.equal(new Set(records.map((p) => p.id)).size, 2);
  assert.equal(records[0].legacyMemoryPath, "/repo");
  assert.equal(records[1].legacyMemoryPath, "/api");
  assert.equal(records[1].color, "red");
  assert.deepEqual(new ProjectStore(dir).list(), records);
});

test("projects sharing a primary retain distinct chat membership after restart", (t) => {
  const { dir, store } = fixture(t, ["/repo"]);
  const original = store.list()[0];
  // Include an old chat not read until AFTER the second project is created.
  store.save([project("explorations"), original]);
  store.assign("new", "explorations");
  const reopened = new ProjectStore(dir);
  assert.equal(reopened.list().length, 2);
  assert.equal(reopened.projectFor("old", "/repo")?.id, original.id);
  assert.equal(reopened.projectFor("new", "/repo")?.id, "explorations");
  assert.equal(reopened.list().find((p) => p.id === "explorations")?.legacyMemoryPath, undefined);
});

test("new chats in a shared worktree use the selected project; legacy chats keep their original project", (t) => {
  const { store } = fixture(t, ["/repo"]);
  const original = store.list()[0];
  store.save([project("second"), original]);
  const worktrees = { "/worktree": { project: "/repo" } };
  store.assign("selected", "second");
  assert.equal(store.projectFor("selected", "/worktree", worktrees)?.id, "second");
  assert.equal(store.projectFor("legacy", "/worktree", worktrees)?.id, original.id);
});

test("moving a chat changes its project without changing cwd, and null membership stays in Recents", (t) => {
  const { store } = fixture(t, [project("one"), project("two")]);
  store.assign("chat", "one");
  store.assign("chat", "two");
  assert.equal(store.projectFor("chat", "/scratch")?.id, "two");
  store.assign("chat", null);
  assert.equal(store.projectFor("chat", "/repo"), null);
});

test("editing name, primary and source folders preserves explicit chat identity", (t) => {
  const { store } = fixture(t, [project("one", ["/repo", "/api"]), project("two")]);
  store.assign("chat", "one");
  const records = store.list();
  store.save(records.map((p) => p.id === "one" ? { ...p, name: "Renamed", primary: "/api", folders: ["/api"] } : p));
  assert.equal(store.projectFor("chat", "/repo")?.name, "Renamed");
  assert.equal(store.list().find((p) => p.id === "two")?.primary, "/repo");
});

test("removing one shared project cannot remove another or transfer its chats", (t) => {
  const { dir, store } = fixture(t, ["/repo"]);
  const original = store.list()[0];
  store.save([project("second"), original]);
  store.assign("second-chat", "second");
  store.save(store.list().filter((p) => p.id !== original.id));
  const reopened = new ProjectStore(dir);
  assert.equal(reopened.projectFor("unseen-old-chat", "/repo"), null);
  assert.equal(reopened.projectFor("second-chat", "/repo")?.id, "second");
  assert.deepEqual(reopened.list().map((p) => p.id), ["second"]);
});

test("legacy path overrides retain their original project despite a shared primary", (t) => {
  const { dir, store } = fixture(t, ["/repo"]);
  const original = store.list()[0];
  writeFileSync(join(dir, "thread-projects.json"), JSON.stringify({ moved: "/repo" }));
  store.save([project("second"), original]);
  assert.equal(store.projectFor("moved", "/elsewhere")?.id, original.id);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "thread-projects.json"), "utf8")), { moved: "/repo" });
});

test("an unknown cwd on cold resume does not erase historical project membership", (t) => {
  const { store } = fixture(t, ["/repo"]);
  assert.equal(store.projectFor("cold", null), null);
  assert.equal(store.projectFor("cold", "/repo")?.id, store.list()[0].id);
});

test("a previously unclaimed folder can still be opened as a project", (t) => {
  const { store } = fixture(t);
  assert.equal(store.projectFor("old", "/repo"), null);
  store.save([project("opened")]);
  assert.equal(store.projectFor("old", "/repo")?.id, "opened");
});

test("prototype-shaped thread IDs persist without changing other assignments", (t) => {
  const { dir, store } = fixture(t, [project("one")]);
  store.assign("__proto__", "one");
  store.assign("constructor", null);
  const reopened = new ProjectStore(dir);
  assert.equal(reopened.projectFor("__proto__", "/elsewhere")?.id, "one");
  assert.equal(reopened.projectFor("constructor", "/repo"), null);
});
