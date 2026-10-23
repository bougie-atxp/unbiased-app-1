import test from "node:test";
import assert from "node:assert/strict";
import { ScopedIdentity } from "./scoped-identity";
const owner = { organizationId: "org", memberId: "member" };
test("verified local identity is reused for the same key and never used for another key", async () => {
  const cache = new ScopedIdentity();
  let calls = 0;
  const lookup = async () => {
    calls++;
    return owner;
  };
  const first = cache.verify("key", () => "key", lookup);
  const concurrent = cache.verify("key", () => "key", lookup);
  await Promise.all([first, concurrent]);
  await cache.verify("key", () => "key", lookup);
  assert.equal(calls, 1);
  assert.deepEqual(cache.owner("key"), owner);
  assert.equal(cache.owner("other"), null);
});
test("account changes and sign-out discard an in-flight identity response", async () => {
  for (const signOut of [false, true]) {
    const cache = new ScopedIdentity();
    let key = "key";
    let finish!: (value: typeof owner) => void;
    const pending = cache.verify(
      key,
      () => key,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    if (signOut) cache.clear();
    else key = "other";
    finish(owner);
    await assert.rejects(pending, /Account changed/);
    assert.equal(cache.owner("key"), null);
  }
});
