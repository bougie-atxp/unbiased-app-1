import assert from "node:assert/strict";
import test from "node:test";
import { isStripeOnboardingPage } from "../shared/stripe-onboarding-url";

test("only the Platform onboarding page needs a system browser", () => {
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/onboarding?organizationId=123"), true);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/approvals/123"), false);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai.evil.test/mcp/onboarding"), false);
  assert.equal(isStripeOnboardingPage("http://platform.unbiased.ai/mcp/onboarding"), false);
  assert.equal(isStripeOnboardingPage("http://localhost:3000/mcp/onboarding", true), true);
  assert.equal(isStripeOnboardingPage("http://localhost:3000/mcp/onboarding"), false);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/onboarding-fake"), false);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/onboarding/extra"), false);
});
