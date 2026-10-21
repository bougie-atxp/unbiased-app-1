import assert from "node:assert/strict";
import { test } from "node:test";
import { firstPartyMcpRegistration } from "./mcp-first-party-oauth";

test("uses the pre-registered client only for the exact first-party MCP resource", () => {
  assert.deepEqual(firstPartyMcpRegistration("https://mcp.unbiased.ai/stripe-projects/mcp"), {
    clientId: "dhTH_VbRdB88tgW-m1HWiw",
    scopes: ["stripe-projects"],
  });
  assert.equal(firstPartyMcpRegistration("https://mcp.unbiased.ai/stripe-projects/other"), null);
  assert.equal(firstPartyMcpRegistration("https://mcp.unbiased.ai/stripe-projects/mcp?other=1"), null);
  assert.equal(firstPartyMcpRegistration("https://other.example/stripe-projects/mcp"), null);
  assert.equal(firstPartyMcpRegistration("not a URL"), null);
});
