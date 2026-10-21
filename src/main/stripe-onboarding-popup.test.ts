import assert from "node:assert/strict";
import test from "node:test";
import { isStripeOnboardingPage, isStripeOnboardingPopup, isStripePopupNavigation } from "./stripe-onboarding-popup";

test("only the Platform onboarding page can open the Stripe popup", () => {
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/onboarding?organizationId=123"), true);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai/mcp/approvals/123"), false);
  assert.equal(isStripeOnboardingPage("https://platform.unbiased.ai.evil.test/mcp/onboarding"), false);
  assert.equal(isStripeOnboardingPage("http://platform.unbiased.ai/mcp/onboarding"), false);
  assert.equal(isStripeOnboardingPage("http://localhost:3000/mcp/onboarding", true), true);
  assert.equal(isStripeOnboardingPage("http://localhost:3000/mcp/onboarding"), false);
});

test("the popup starts at Stripe Connect or blank and stays on trusted HTTPS origins", () => {
  assert.equal(isStripeOnboardingPopup("https://connect.stripe.com/d/setup/abc"), true);
  assert.equal(isStripeOnboardingPopup("about:blank"), true);
  assert.equal(isStripeOnboardingPopup("https://dashboard.stripe.com/"), false);
  assert.equal(isStripeOnboardingPopup("https://connect.stripe.com.evil.test/"), false);
  assert.equal(isStripePopupNavigation("https://connect.stripe.com/d/setup/abc"), true);
  assert.equal(isStripePopupNavigation("https://identity.stripe.com/verify"), true);
  assert.equal(isStripePopupNavigation("https://platform.unbiased.ai/mcp/onboarding"), true);
  assert.equal(isStripePopupNavigation("http://connect.stripe.com/"), false);
  assert.equal(isStripePopupNavigation("https://stripe.com.evil.test/"), false);
});
