const STRIPE_PROJECTS_MCP_URL = "https://mcp.unbiased.ai/stripe-projects/mcp";
const STRIPE_PROJECTS_CLIENT_ID = "dhTH_VbRdB88tgW-m1HWiw";

export function firstPartyMcpRegistration(serverUrl: string): { clientId: string; scopes: string[] } | null {
  try {
    if (new URL(serverUrl).toString() !== STRIPE_PROJECTS_MCP_URL) return null;
  } catch {
    return null;
  }
  return { clientId: STRIPE_PROJECTS_CLIENT_ID, scopes: ["stripe-projects"] };
}
