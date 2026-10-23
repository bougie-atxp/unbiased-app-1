export const AGENT_BROWSER_TOOLS = [
  {
    type: "function",
    name: "browser_search",
    description:
      "Search the web and get back ranked results (title, URL, snippet). Use this FIRST for research questions instead of guessing URLs, and whenever a site blocks logged-out visitors — public sources (Wikipedia, news, official about/help pages) usually work when the site's own app does not. Follow up with browser_open on a result URL, or browser_snapshot the results page to click through. Prefer two or three independent sources over one.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for" } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "browser_open",
    description:
      "Open a URL in your browser and wait for it to load. Returns the page title. Note: many sites show an automated browser only a signup wall or a bot check — if what comes back looks like a login gate instead of content, do not retry it; search for public sources with browser_search, or ask the user about browser_connect.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    type: "function",
    name: "browser_snapshot",
    description:
      "Accessibility-tree snapshot of the current page with stable element refs (e.g. [ref=e7]). Call this after navigation to see the page; pass a ref like 'e7' to browser_click/browser_fill/browser_type.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "browser_read",
    description: "The current page as agent-readable text (markdown-ish). Good for articles; use browser_snapshot when you need to interact.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "browser_click",
    description: "Click an element by its snapshot ref.",
    inputSchema: { type: "object", properties: { ref: { type: "string", description: "Element ref from browser_snapshot, e.g. 'e7'" } }, required: ["ref"] },
  },
  {
    type: "function",
    name: "browser_fill",
    description: "Clear an input and fill it with text, by snapshot ref.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string" }, text: { type: "string" } },
      required: ["ref", "text"],
    },
  },
  {
    type: "function",
    name: "browser_type",
    description: "Type text into an element (no clearing), by snapshot ref.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string" }, text: { type: "string" } },
      required: ["ref", "text"],
    },
  },
  {
    type: "function",
    name: "browser_press",
    description: "Press a key or chord, e.g. 'Enter', 'Tab', 'Control+a'.",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  },
  {
    type: "function",
    name: "browser_scroll",
    description: "Scroll the page.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        pixels: { type: "number" },
      },
      required: ["direction"],
    },
  },
  {
    type: "function",
    name: "browser_screenshot",
    description: "Screenshot the current page (returned to you as an image).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "browser_back",
    description: "Go back in browser history.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "browser_connect",
    description:
      "Get a signed-in browser session, for tasks that need the user's OWN accounts: their email, their X timeline, a dashboard or admin panel — anything behind a login that no public page can answer. CALL THIS DIRECTLY as your first step for such a task. " +
      "This opens a SEPARATE browser window that the app manages; it does not use the browser the user is running and cannot see their existing windows or tabs. When the user names their own browser (\"my chrome\", \"the tab I have open\") or COMPUTER is selected for the turn, use computer_app_state instead. " +
      "Do NOT ask the user in chat whether you may proceed and do not wait for their reply — that includes private data like their email, messages or bank pages: the app shows them its OWN permission prompt, which they approve or deny, and that prompt IS the consent step, so asking again in chat only wastes a round trip. On approval the app opens and attaches a browser window by itself. Example: a request like 'go over my email and find the message from X' means call browser_connect straight away. There is nothing for the user to run. If the result says the profile is new and not signed in yet, tell the user to sign in in that window and stop; otherwise keep browsing as them. Prefer browser_search for anything public. While attached, browser_close leaves the browser open.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "string", description: "CDP port or ws:// URL (default 9222)" } },
    },
  },
  {
    type: "function",
    name: "browser_close",
    description: "Close the automation browser when you are done. Never closes the user's own Chrome, even while attached to it.",
    inputSchema: { type: "object", properties: {} },
  },
];

