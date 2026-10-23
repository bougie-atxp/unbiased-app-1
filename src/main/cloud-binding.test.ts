import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CloudBindings,
  ConversationRouter,
  cloudEligible,
  keyFingerprint,
  type RemoteTransport,
} from "./cloud-binding";
import { gitPreflight, type GitRunner } from "./cloud-preflight";
import { projectRecord } from "./project-identity";
const owner = { organizationId: "org", memberId: "user" };
test("cloud eligibility is explicit device provenance tied to the exact key", () => {
  const auth = {
    owner,
    provenance: "platform_device" as const,
    keyFingerprint: keyFingerprint("key"),
  };
  assert.equal(cloudEligible(auth, "key"), true);
  assert.equal(cloudEligible({ ...auth, provenance: "api_key" }, "key"), false);
  assert.equal(cloudEligible(auth, "other"), false);
  assert.equal(cloudEligible({ ...auth, owner: null }, "key"), false);
});
test("handoff freezes local execution, survives restart, and never falls back after cloud binding", async () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "binding-"));
  try {
    const store = new CloudBindings(dir);
    const router = new ConversationRouter(store, () => owner);
    let local = 0;
    const run = () => {
      local++;
      return Promise.resolve("local");
    };
    assert.equal(
      await router.request("turn/start", { threadId: "local" }, run),
      "local",
    );
    assert.throws(() => store.prepare("thread", owner, null, true));
    const b = store.prepare("thread", owner, null, false);
    await assert.rejects(
      () => router.request("turn/start", { threadId: "thread" }, run),
      /paused/,
    );
    assert.throws(() => store.prepare("thread", owner, null, false));
    store.fail("thread", b.attemptId!, "network outcome unknown");
    assert.throws(() => store.prepare("thread", owner, null, false));
    await assert.rejects(
      () => router.request("turn/start", { threadId: "thread" }, run),
      /paused/,
    );
    store.recoverLocal("thread", b.attemptId!);
    const retry = store.prepare("thread", owner, null, false);
    assert.throws(
      () => store.complete("thread", b.attemptId!, "remote"),
      /Stale/,
    );
    store.complete("thread", retry.attemptId!, "remote");
    const restarted = new ConversationRouter(
      new CloudBindings(dir),
      () => owner,
    );
    for (const method of ["turn/start", "turn/interrupt", "thread/resume"])
      await assert.rejects(
        () => restarted.request(method, { threadId: "thread" }, run),
        /fallback/,
      );
    assert.throws(() => store.recoverLocal("thread", retry.attemptId!));
    assert.equal(local, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("remote routing, ownership, durable event cursor and replay deduplication", async () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "binding-"));
  try {
    const store = new CloudBindings(dir);
    const b = store.prepare("thread", owner, "project", false);
    store.complete("thread", b.attemptId!, "remote");
    const calls: string[] = [];
    const remote: RemoteTransport = {
      request: async (_, method) => {
        calls.push(method);
        return "remote";
      },
      decide: async () => {
        calls.push("decide");
      },
      environment: async () => {},
      async *events() {},
    };
    const router = new ConversationRouter(store, () => owner, remote);
    assert.equal(
      await router.request("turn/start", { threadId: "thread" }, async () => {
        throw Error("local executed");
      }),
      "remote",
    );
    await router.decide("thread", "approval", "deny");
    assert.deepEqual(calls, ["turn/start", "decide"]);
    await assert.rejects(
      () =>
        new ConversationRouter(
          store,
          () => ({ ...owner, organizationId: "other" }),
          remote,
        ).request("turn/start", { threadId: "thread" }, async () => null),
      /another/,
    );
    let delivered = 0;
    const apply = async () => {
      delivered++;
    };
    assert.equal(await store.consume("thread", 1, apply, {}), true);
    assert.equal(
      await new CloudBindings(dir).consume("thread", 1, apply, {}),
      false,
    );
    await assert.rejects(() => store.consume("thread", 3, apply, {}), /GAP/);
    assert.equal(delivered, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("preflight examines every source and identifies the blocking checkout without writes", async () => {
  const project = projectRecord({
    folders: ["/repo/a", "/repo/b"],
    primary: "/repo/a",
  });
  for (const s of project.sources) {
    s.kind = "git";
    s.repositoryId = `repo-${s.id}`;
  }
  const commands: string[][] = [];
  const git: GitRunner = async (cwd, args) => {
    commands.push(args);
    if (args[0] === "symbolic-ref") return "main";
    if (args[0] === "remote") return "https://example.com/org/repo.git";
    if (args[0] === "status") return cwd.endsWith("b") ? " M file" : "";
    if (args[0] === "rev-list") return "0\t0";
    if (args.includes("--abbrev-ref")) return "origin/main";
    return "a".repeat(40);
  };
  const results = await gitPreflight(project, git);
  assert.equal(results[0].blocker, null);
  assert.match(results[1].blocker!, /Commit and push/);
  assert.equal(results[1].sourceId, project.sources[1].id);
  assert.equal(
    commands.some((a) => ["push", "commit", "init", "fetch"].includes(a[0])),
    false,
  );
});

test("cloud-bound requests cannot register local capabilities or transfer local attachment paths", async () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "cloud-capabilities-"));
  try {
    const store = new CloudBindings(dir);
    const b = store.prepare("thread", owner, null, false);
    store.complete("thread", b.attemptId!, "remote");
    const remote: RemoteTransport = {
      request: async () => {
        throw Error("remote should not receive local capabilities");
      },
      decide: async () => {},
      environment: async () => {},
      async *events() {},
    };
    const router = new ConversationRouter(store, () => owner, remote);
    await assert.rejects(
      () =>
        router.request(
          "turn/start",
          {
            threadId: "thread",
            input: [{ type: "localImage", path: "/private/image.png" }],
          },
          async () => null,
        ),
      /portable artifact/,
    );
    await assert.rejects(
      () =>
        router.request(
          "thread/fork",
          { threadId: "thread", dynamicTools: [{ name: "computer_click" }] },
          async () => null,
        ),
      /Local dynamic tools/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("remote environment mutations cannot target another conversation in the same account", async () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "cloud-environment-"));
  try {
    const store = new CloudBindings(dir);
    const b = store.prepare("thread", owner, null, false);
    store.complete("thread", b.attemptId!, "remote");
    let writes = 0;
    const remote: RemoteTransport = {
      request: async () => null,
      decide: async () => {},
      environment: async () => {
        writes++;
      },
      async *events() {},
    };
    const router = new ConversationRouter(store, () => owner, remote);
    const fixture = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "../../contracts/environment/fixtures/valid.json",
        ),
        "utf8",
      ),
    );
    await assert.rejects(
      () =>
        router.environment(
          "thread",
          {
            ...fixture,
            owner,
            scope: {
              kind: "conversation",
              projectId: null,
              conversationId: "other",
            },
            skills: [],
            connectors: [],
          },
          0,
        ),
      /scope/,
    );
    assert.equal(writes, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
