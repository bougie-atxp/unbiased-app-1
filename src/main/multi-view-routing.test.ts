import assert from "node:assert/strict";
import test from "node:test";
import { multiViewRecipients } from "./multi-view-routing";

test("chat events reach only tiles showing the same conversation", () => {
  const panes = {
    main: { threadId: "a" },
    "multi:a": { threadId: "a" },
    "multi:b": { threadId: "b" },
    "side:1": { threadId: "fork" },
  };
  assert.deepEqual(multiViewRecipients(panes, "main"), ["multi:a"]);
  assert.deepEqual(multiViewRecipients(panes, "multi:a"), []);
  assert.deepEqual(multiViewRecipients(panes, "side:1"), []);
});
