const PLATFORM_ORIGIN = "https://platform.unbiased.ai";

function parsedUrl(value: string): URL | null {
  try { return new URL(value); }
  catch { return null; }
}

export function isStripeOnboardingPage(url: string, development = false): boolean {
  const parsed = parsedUrl(url);
  if (!parsed || parsed.pathname !== "/mcp/onboarding") return false;
  return parsed.origin === PLATFORM_ORIGIN ||
    (development && parsed.origin === "http://localhost:3000");
}

export function isStripeOnboardingPopup(url: string): boolean {
  const parsed = parsedUrl(url);
  return url === "about:blank" ||
    (parsed?.protocol === "https:" && parsed.hostname === "connect.stripe.com");
}

export function isStripePopupNavigation(url: string): boolean {
  const parsed = parsedUrl(url);
  return parsed?.protocol === "https:" &&
    (parsed.hostname === "stripe.com" || parsed.hostname.endsWith(".stripe.com") ||
      parsed.origin === PLATFORM_ORIGIN);
}
