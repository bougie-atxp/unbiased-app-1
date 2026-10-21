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
