import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFile, spawn as spawnProcess, type ChildProcess, type ExecException } from "node:child_process";
import { get as httpGet } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { AGENT_BROWSER_TOOLS } from "./tools";
import type { RuntimeOptions, RuntimeEvent, ToolResult } from "./protocol";
type DynamicToolResponse = ToolResult;

export function createBrowserRuntime(options: RuntimeOptions, send: (name: RuntimeEvent["event"], payload: any) => void) {
// Automation uses only our private application identity and a private profile.
// Never silently launch an installed everyday browser, even with another profile.
const AGENT_CHROME_PORT = options.port ?? 9222;
function agentChromeProfile(): string {
  return join(options.home, ".unbiased", "browser-profile");
}
let managedChrome: ChildProcess | null = null;
let browserStopping: Promise<void> | null = null;
let browserShuttingDown = false;
function stopManagedChrome(): Promise<void> {
  if (browserStopping) return browserStopping;
  const child = managedChrome;
  if (!child) return Promise.resolve();
  browserStopping = new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); if (managedChrome === child) managedChrome = null; resolve(); };
    const timer = setTimeout(() => {
      // Leave the guardian alive to finish cleanup rather than killing it
      // before it has reaped its browser. Startup recovery handles failures.
      child.kill("SIGTERM"); resolve();
    }, 3500);
    child.once("exit", done);
    child.stdin?.end();
  }).finally(() => { browserStopping = null; });
  return browserStopping;
}
function privateBrowser() {
  return { executable: join(options.browserRoot, "Unbiased Browser.app/Contents/MacOS/Google Chrome for Testing"), supervisor: join(options.browserRoot, "browser-supervisor"), denyDirectLaunch: join(options.browserRoot, "browser-no-direct-launch") };
}
function browserProcessRecord() {
  return join(options.home, ".unbiased", "automation-browser.pid");
}
async function browserGuardianCommand(supervisor: string, args: string[]): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const result = await new Promise<{error:ExecException|null;stderr:string}>(resolve => {
      execFile(supervisor, args, {timeout:6000,maxBuffer:4096}, (error,_out,stderr) => resolve({error,stderr:String(stderr)}));
    });
    if (!result.error) return;
    // A killed runtime's guardian may still be reaping its browser group.
    // Wait for that bounded cleanup; never steal a live owner's profile lock.
    if (args[0] === "--recover" && Number(result.error.code) === 73 && Date.now() < deadline) { await wait(100); continue; }
    throw new Error(result.stderr.trim() || result.error.message);
  }
}
// Two threads can call browser_connect at once; without this both would spawn
// Chrome against the same profile, the loser would exit on Chrome's profile
// singleton, and its exit handler would wipe state belonging to the winner.
let chromeLaunch: Promise<{ ok: boolean; launched: boolean; firstRun: boolean; error?: string }> | null = null;

/** Is something speaking the DevTools protocol on this port? */
function cdpAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet({ host: "127.0.0.1", port, path: "/json/version", timeout: 1200 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Is the browser already listening on `port` one WE started?
 *
 * This distinction used to be guessed from `launched`: anything already
 * listening was treated as the user's own browser. That is wrong after an
 * unclean exit — our own managed Chrome outlives the app (window-all-closed
 * never runs on SIGTERM), so the next launch adopted its own browser while
 * believing it belonged to the user, which suppressed the mirror pane and
 * made resetting a stale tab unsafe.
 *
 * Ownership requires the private executable AND its exact profile argument.
 * An occupied debugging port alone never authorizes adoption or termination.
 */
function ownsChromeOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { timeout: 4000 }, (err, pids) => {
      const pid = String(pids ?? "").trim().split(/\s+/).filter(Boolean)[0];
      if (err || !pid) return resolve(false);
      const paths = privateBrowser();
      execFile(paths.supervisor, ["--owns", pid, paths.executable, agentChromeProfile()], { timeout: 4000 }, (error) => resolve(!error));
    });
  });
}

/** Attach target for browser_connect: an already-debuggable browser if one is
 *  listening (including one the user started themselves), otherwise our own
 *  Chrome, launched here so the user never has to run a terminal command. */
async function ensureAgentChrome(
  port: number,
): Promise<{ ok: boolean; launched: boolean; firstRun: boolean; error?: string }> {
  if (chromeLaunch) return chromeLaunch;
  chromeLaunch = launchAgentChrome(port).finally(() => {
    chromeLaunch = null;
  });
  return chromeLaunch;
}

async function launchAgentChrome(
  port: number,
): Promise<{ ok: boolean; launched: boolean; firstRun: boolean; error?: string }> {
  if (browserStopping) await browserStopping;
  if (browserShuttingDown) return { ok: false, launched: false, firstRun: false, error: "Unbiased is shutting down its browser." };
  if (managedChrome) {
    if (await cdpAlive(port) && await ownsChromeOnPort(port)) return { ok: true, launched: false, firstRun: false };
    await stopManagedChrome();
  }
  if (process.platform === "darwin" && Number((options.osVersion ?? "13.0").split(".")[0]) < 13) {
    return { ok: false, launched: false, firstRun: false, error: "The private Agent browser requires macOS 13 or newer. Update macOS to use browser automation." };
  }
  const { executable: bin, supervisor, denyDirectLaunch } = privateBrowser();
  if (!existsSync(bin) || !existsSync(supervisor) || !existsSync(denyDirectLaunch)) {
    return {
      ok: false,
      launched: false,
      firstRun: false,
      error: "Unbiased's private browser is missing. Reinstall Unbiased, or run npm run prepare:browser in development.",
    };
  }
  const profile = agentChromeProfile();
  const firstRun = !existsSync(profile);
  try {
    mkdirSync(profile, { recursive: true });
    // Older releases used installed Chrome with this separate profile. Only
    // orphaned roots are retired; a live older app must be quit by the user.
    await browserGuardianCommand(supervisor, ["--retire-legacy", join(options.home, ".unbiased", "chrome-profile")]);
    // Recovery verifies the recorded PID's start time, executable and exact
    // profile, and refuses when another live supervisor owns the profile.
    await browserGuardianCommand(supervisor, ["--recover", browserProcessRecord(), bin, profile]);
  } catch (err) {
    return { ok: false, launched: false, firstRun, error: `Could not prepare the private browser: ${String(err)}` };
  }
  if (await cdpAlive(port)) {
    return { ok: false, launched: false, firstRun, error: `Port ${port} is already in use. Close the older Unbiased browser or explicitly connect to the browser you want to use.` };
  }
  // Windowless by default: the Agent browser side tab IS the window, so a
  // second Chrome on the desktop is just clutter. The tab streams frames and
  // forwards clicks/typing, so sign-ins happen there too.
  //
  // Escape hatch: some sites refuse headless clients outright (bot checks,
  // certain Google sign-in flows). UNBIASED_AGENT_CHROME_HEADED=1 restores the
  // real window for those cases without a rebuild.
  const headed = options.headed === true;
  if (browserShuttingDown) return { ok: false, launched: false, firstRun, error: "Unbiased is shutting down its browser." };
  managedChrome = spawnProcess(
    supervisor,
    [
      browserProcessRecord(), bin, profile,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      ...(headed
        ? // A covered window gets its rendering throttled, which stalls
          // Page.startScreencast — the mirror must keep working behind the app.
          ["--disable-backgrounding-occluded-windows"]
        : ["--headless=new"]),
      // Headless defaults to 800x600, which makes desktop sites render their
      // narrow layout. Give pages a normal viewport to lay out in.
      "--window-size=1440,900",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { detached: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  const child = managedChrome;
  let launchError = "";
  let spawnFailed = false;
  child.stdout?.resume();
  child.stderr?.on("data", (data) => { launchError = (launchError + String(data)).slice(-2000); });
  child.on("error", (error) => {
    launchError = error.message; spawnFailed = true;
    if (managedChrome === child) managedChrome = null;
  });
  child.on("exit", () => {
    // Only clear state if the process that died is still the current one.
    if (managedChrome === child) managedChrome = null;
  });
  for (let tries = 0; tries < 24; tries++) {
    await wait(500);
    if (spawnFailed || child.exitCode !== null || child.signalCode !== null) {
      return { ok: false, launched: false, firstRun, error: launchError || "Private browser supervisor exited before startup." };
    }
    if (await cdpAlive(port) && await ownsChromeOnPort(port)) {
      // Our Chrome is up — same signal the per-tool path sends, so the pane
      // appears on a cold start too, before the first tool returns.
      send("agentmirror:activity", { tool: "launch" });
      return { ok: true, launched: true, firstRun };
    }
  }
  await stopManagedChrome();
  return { ok: false, launched: true, firstRun, error: `Chrome started but never opened port ${port}.` };
}

// Set when attached to a browser WE DID NOT LAUNCH: closing it would take
// down tabs that are not ours. A browser this app started is ours to close.
let browserAttachedExternal = false;

// Whether the agent-browser CLI's session is bound to our Chrome yet.
//
// This is the fix for the two-browsers bug. `runAgentBrowser` passes no
// --cdp/--session/--profile, so the CLI uses its own "default" session — and
// an unbound default session launches its OWN Chrome in a throwaway temp
// profile. Only browser_connect ever called ensureAgentChrome, so every other
// tool (open, search, snapshot…) drove that temp browser while the Agent
// browser pane mirrored port 9222 and showed a Chrome nobody was driving.
// Binding once, before the first tool that needs a page, makes the pane and
// the agent the same browser by construction.
let browserSessionBound = false;
let browserConnectedEndpoint: string | null = null;

/**
 * Make sure the CLI is attached to a browser we can also mirror.
 * Returns null on success, or the message to hand back to the model.
 */
async function ensureBrowserSession(): Promise<string | null> {
  // A browser the user pointed us at is already attached and is not ours to
  // re-target; leave it exactly as it is.
  if (browserAttachedExternal) return null;
  if (browserSessionBound) {
    if (managedChrome && await cdpAlive(AGENT_CHROME_PORT) && await ownsChromeOnPort(AGENT_CHROME_PORT)) return null;
    browserSessionBound = false;
    browserConnectedEndpoint = null;
    browserTabs.clear();
    browserActiveRoot = null;
  }
  const ready = await ensureAgentChrome(AGENT_CHROME_PORT);
  if (!ready.ok) {
    return (
      `Could not start a browser session: ${ready.error ?? "unknown error"}. ` +
      "Use browser_search and public pages instead."
    );
  }
  // If the process disappears or the port changes hands during launch, fail
  // closed. External attachments require an explicit browser_connect call.
  if (!(await ownsChromeOnPort(AGENT_CHROME_PORT))) {
    return "The private browser disconnected before attachment. Retry the browser tool.";
  }
  const r = await runAgentBrowser(["connect", String(AGENT_CHROME_PORT)], 30_000);
  // `connect` exits 0 even when discovery fails, so read the output.
  if (!r.ok || /✗|failed|refused/i.test(r.out)) {
    return `Could not attach to a browser on port ${AGENT_CHROME_PORT}: ${r.out || "no detail"}`;
  }
  browserSessionBound = true;
  browserConnectedEndpoint = String(AGENT_CHROME_PORT);
  // A Chrome of OURS that we did not just launch is a leftover from a previous
  // run, still parked on whatever it was last doing. Blank it, so the pane
  // opens on this session's work instead of presenting a stale page as the
  // agent's view. Never done to a browser that is not ours.
  if (!ready.launched && !browserAttachedExternal) {
    await runAgentBrowser(["open", "about:blank"], 20_000);
  }
  return null;
}

/**
 * One browser tab per conversation.
 *
 * The session stays single and shared — that is deliberate, and it is what
 * keeps the user's signed-in state working: an `--session` per chat would mean
 * a separate Chrome with a separate profile, so every conversation would have
 * to log in to X again, and the mirror would have no single port to watch.
 * What was missing is the dimension below it. Two chats browsing at once both
 * drove the one page: an open in one moved the page out from under the other,
 * and a snapshot could return someone else's site.
 *
 * Keyed by the ROOT conversation, so a side chat and its sub-agents share the
 * tab of the conversation they belong to rather than each spawning their own.
 */
const browserTabs = new Map<string, { label: string; targetId: string | null }>();

// Whose tab is currently ACTIVE in the CLI session. Selection is skipped when
// it would be a no-op, and that is not an optimisation: `tab <label>` — even
// re-selecting the tab that is already active — invalidates every ref the
// last snapshot handed out. Measured: snapshot → tab <same> → click @ref
// fails "Unknown ref"; snapshot → click works. Selecting before every call
// therefore broke every snapshot-then-act sequence, which is the normal
// shape of browser work. Only our own selections change the active tab (the
// agent has no tab tools and the mirror binds by target id), so this tracker
// cannot go stale.
let browserActiveRoot: string | null = null;

/** A tab label is passed to the CLI as a ref, so it has to be a bare token.
 *  Hashed rather than truncated: thread ids share long prefixes, and two
 *  conversations colliding on a label would silently share a tab — the exact
 *  bug this exists to fix. */
function browserTabLabel(rootId: string): string {
  return `chat-${createHash("sha256").update(rootId).digest("hex").slice(0, 10)}`;
}

/**
 * Serialize browser work across conversations.
 *
 * Selecting a tab is STATEFUL — the CLI has no per-command tab flag, and each
 * session simply remembers its active tab. So "select, then act" has to be
 * atomic: without this, chat A selects, chat B selects, and A's command lands
 * on B's page. The lock spans a whole tool call rather than a single command,
 * because browser_search is an open/wait/eval/read sequence that must stay on
 * one tab throughout.
 */
let browserOpChain: Promise<unknown> = Promise.resolve();
function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chained on settle, not on success: one failed call must not wedge the
  // queue for every conversation after it.
  const run = browserOpChain.then(fn, fn);
  browserOpChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Learn a labelled tab's CDP target id, so the mirror can follow that exact
 *  tab instead of guessing from URLs. */
async function browserTabTargetId(label: string): Promise<string | null> {
  const r = await runAgentBrowser(["tab", "list", "--json"]);
  try {
    const parsed = JSON.parse(r.out) as { data?: { tabs?: { label?: string | null; targetId?: string }[] } };
    const hit = (parsed.data?.tabs ?? []).find((t) => t.label === label);
    return typeof hit?.targetId === "string" ? hit.targetId : null;
  } catch {
    return null;
  }
}

/** Give this conversation its own tab and make it the active one. Returns null
 *  on success, or the message to hand back to the model. */
async function selectConversationTab(rootId: string): Promise<string | null> {
  const label = browserTabLabel(rootId);
  let entry = browserTabs.get(rootId);
  // Same conversation as the last browser call: the tab is already active,
  // and re-selecting it would throw away the refs its latest snapshot issued.
  // "Active" here includes a popup the page itself opened — the CLI follows
  // those (measured), and the conversation's work moves with it.
  if (entry && browserActiveRoot === rootId) return null;
  if (!entry) {
    const made = await runAgentBrowser(["tab", "new", "--label", label, "about:blank"], 30_000);
    if (!made.ok) return `Could not open a browser tab for this conversation: ${made.out}`;
    entry = { label, targetId: null };
    browserTabs.set(rootId, entry);
  }
  // Selected explicitly, including right after creating it. `tab new` almost
  // certainly activates what it opened, but "almost certainly" is not good
  // enough here: if it ever does not, the command that follows lands on
  // another conversation's page, which is the whole class of bug this exists
  // to prevent.
  // Select by CDP target id when one is known, falling back to the label.
  // The label marks the tab this conversation STARTED in; the target id
  // tracks where its work actually lives now — a click that opened the
  // workspace in a popup moves the work there, and re-selecting the labelled
  // tab would strand the agent back on the page it already left.
  const sel = await runAgentBrowser(["tab", entry.targetId ?? label]);
  if (!sel.ok || /tab_gone|not found/i.test(sel.out)) {
    // Closed underneath us — by the user, or by a crash. Make a fresh one
    // rather than let the CLI fall back to whatever tab is active.
    const made = await runAgentBrowser(["tab", "new", "--label", label, "about:blank"], 30_000);
    if (!made.ok) return `Could not reopen this conversation's browser tab: ${made.out}`;
    entry.targetId = null;
    const again = await runAgentBrowser(["tab", label]);
    if (!again.ok) return `Could not select this conversation's browser tab: ${again.out}`;
  }
  browserActiveRoot = rootId;
  if (!entry.targetId) entry.targetId = await browserTabTargetId(label);
  return null;
}

// ── Agent-browser mirror ─────────────────────────────────────────────
// Shows the agent's Chrome inside the side panel: a minimal CDP client on the
// same 127.0.0.1 port agent-browser drives. Frames come from
// Page.startScreencast and cross IPC as data URLs (the renderer's CSP forbids
// remote images); input goes back through Input.* — the renderer sends only
// normalized {kind,...} shapes and the mapping to CDP methods lives HERE, so
// a compromised renderer cannot name arbitrary protocol methods.
let mirrorWs: WebSocket | null = null;
// Supervisor state. The pane can be opened before Chrome exists, the agent can
// close and reopen tabs, and a target can be destroyed mid-session — a single
// attach attempt loses in all three cases, so "wanting" the mirror is a
// standing intent that a timer keeps trying to satisfy.
let mirrorDesired = false;
let mirrorSize = { width: 800, height: 600, dpr: 1 };
let mirrorTargetId: string | null = null;
// The last page the agent asked for. /json/list is not ordered by what the
// agent is doing — a stray chrome://settings tab sorted ahead of the real work
// and the pane mirrored the wrong tab — so the agent's own navigation is the
// authority on which tab to watch.
let mirrorPreferredUrl: string | null = null;
// The conversation the pane is SHOWING — not the one that happens to be
// acting. Those are different, and conflating them is what put one chat's X
// feed in another chat's pane: every browser tool call was overwriting a
// global "preferred target", so whichever conversation browsed last won the
// pane regardless of which chat the user had open.
//
// Stored as the conversation, resolved to a tab at tick time rather than once
// at start: a chat that has not browsed yet has no tab, and its tab must be
// picked up the moment it is created.
let mirrorViewRoot: string | null = null;
// Dimensions of the last frame Chrome sent, in page CSS pixels. Compared each
// tick against the shape we asked for: if they drift — a dropped resize, or
// another CDP client changing emulation — the mirror re-imposes its viewport
// instead of letterboxing until someone drags the pane.
let mirrorLastFrame: { width: number; height: number } | null = null;
/** The viewport WE last imposed. Frames are compared against this rather than
 *  against a freshly computed one, so a correction in flight is not mistaken
 *  for a second problem. */
let mirrorWantVp: { width: number; height: number } | null = null;
let mirrorMismatchSince = 0;
let mirrorCorrectAt = 0;
let mirrorCorrecting = false;
/** How long a wrong-shaped frame may be withheld while a correction lands.
 *  Past this the pane shows it anyway: a briefly odd mirror beats a frozen
 *  one, and if the correction cannot succeed the user should see reality. */
const MIRROR_SHAPE_GRACE_MS = 2_000;

type CdpTarget = { id?: string; type: string; url: string; title?: string; webSocketDebuggerUrl?: string };

function originOf(u: string): string | null {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

/** Which tab to mirror, most specific signal first. Deterministic for a given
 *  list, so the supervisor cannot flap between two candidates. */
function pickMirrorTarget(targets: CdpTarget[]): CdpTarget | null {
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  const web = pages.filter((t) => t.url.startsWith("http://") || t.url.startsWith("https://"));
  // A conversation owns exactly one tab, so when the pane is showing a
  // conversation there is exactly one right answer — and if that tab does not
  // exist yet, the right answer is NOTHING. The heuristics below used to be
  // correct when every chat shared one page; with a tab each they actively
  // mislead, because "any real web page" is now quite likely to be a
  // different conversation's.
  const viewTab = mirrorViewRoot ? browserTabs.get(mirrorViewRoot)?.targetId : null;
  if (mirrorViewRoot) return (viewTab ? pages.find((t) => t.id === viewTab) : undefined) ?? null;
  const want = mirrorPreferredUrl;
  const wantOrigin = want ? originOf(want) : null;
  return (
    (want ? web.find((t) => t.url === want) : undefined) ??
    (wantOrigin ? web.find((t) => originOf(t.url) === wantOrigin) : undefined) ??
    // Any real web page beats chrome://, devtools://, about: — the agent reads
    // the web, and those are never the work.
    web[0] ??
    pages.find((t) => t.url && t.url !== "about:blank") ??
    pages[0] ??
    null
  );
}
let mirrorTimer: NodeJS.Timeout | null = null;
let mirrorAttaching = false;
let mirrorMsgId = 0;
const mirrorPending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function mirrorCall(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const ws = mirrorWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("mirror not connected"));
  const id = ++mirrorMsgId;
  ws.send(JSON.stringify({ id, method, params: params ?? {} }));
  return new Promise((resolve, reject) => {
    mirrorPending.set(id, { resolve, reject });
    setTimeout(() => {
      if (mirrorPending.delete(id)) reject(new Error(`CDP ${method} timed out`));
    }, 10_000).unref?.();
  });
}

/** Make the PAGE's viewport match the pane's shape, so the mirror fills the
 *  tab like a real browser instead of letterboxing a fixed 1440x900 window
 *  into it. Width is floored at a desktop size: the pane can be narrow, and a
 *  700px-wide viewport makes sites serve their mobile layout — which the agent
 *  would then be reading too. Above that floor the page simply renders larger
 *  and scales down, exactly like zooming out. */
function mirrorViewport(paneW: number, paneH: number): { width: number; height: number } {
  const width = Math.max(1024, Math.round(paneW) || 1024);
  const ratio = paneW > 0 && paneH > 0 ? paneH / paneW : 0.75;
  const height = Math.min(4096, Math.max(400, Math.round(width * ratio)));
  return { width, height };
}

/** Capture at the density the pane is actually PAINTED at. The frame is drawn
 *  into paneW*dpr physical pixels, so a deviceScaleFactor of 1 means Chrome
 *  hands us a 1024px-wide image that gets stretched across ~1490 real pixels —
 *  visibly soft text. Scale so the frame carries one image pixel per physical
 *  pixel, and no more: past that it is bytes nobody can see. */
async function mirrorApplyViewport(
  paneW: number,
  paneH: number,
  dpr: number,
): Promise<{ width: number; height: number; scale: number }> {
  const vp = mirrorViewport(paneW, paneH);
  const wanted = Math.max(1, paneW) * (dpr > 0 ? dpr : 1);
  const scale = Math.min(2, Math.max(1, wanted / vp.width));
  await mirrorCall("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: scale,
    mobile: false,
  });
  mirrorWantVp = { width: vp.width, height: vp.height };
  return { ...vp, scale };
}

/** Is this frame shaped like the viewport we asked for? */
function mirrorShapeWrong(got: { width: number; height: number } | null): boolean {
  if (!got || !mirrorWantVp) return false;
  return Math.abs(got.width - mirrorWantVp.width) > 2 || Math.abs(got.height - mirrorWantVp.height) > 2;
}

/**
 * Re-impose our viewport on the mirrored tab.
 *
 * Something else changes it out from under us: the agent-browser CLI drives
 * the same tab and sets its own metrics for snapshots, and Chrome drops an
 * override on some navigations. The old code only noticed on the 1.5s
 * supervisor tick, which is precisely the "resizes for a moment" the pane
 * showed. Called from the frame handler now, so a stray shape is corrected on
 * the very next frame, with a cooldown so a burst of odd frames cannot turn
 * into a burst of overrides (each of which would itself cause a reflow).
 */
async function mirrorCorrectViewport(): Promise<void> {
  if (mirrorCorrecting || !mirrorWs) return;
  const now = Date.now();
  if (now - mirrorCorrectAt < 600) return;
  mirrorCorrecting = true;
  mirrorCorrectAt = now;
  try {
    const vp = await mirrorApplyViewport(mirrorSize.width, mirrorSize.height, mirrorSize.dpr);
    await restartScreencast(vp);
  } catch {
    /* the supervisor tick retries */
  } finally {
    mirrorCorrecting = false;
  }
}

/** Screencast bounds in the SAME pixels the frame is rendered in. */
function mirrorFrameBounds(vp: { width: number; height: number; scale: number }) {
  return {
    maxWidth: Math.min(3200, Math.round(vp.width * vp.scale)),
    maxHeight: Math.min(3200, Math.round(vp.height * vp.scale)),
  };
}

let screencastChain: Promise<unknown> = Promise.resolve();
function restartScreencast(vp: { width: number; height: number; scale: number }): Promise<void> {
  const socket = mirrorWs;
  const run = screencastChain.catch(() => {}).then(async () => {
    if (!socket || socket !== mirrorWs) throw new Error("Browser view was replaced");
    // Modern Chrome rejects a second start while the same stream is active.
    await mirrorCall("Page.stopScreencast").catch(() => {});
    if (socket !== mirrorWs) throw new Error("Browser view was replaced");
    await mirrorCall("Page.startScreencast", {format:"jpeg",quality:85,...mirrorFrameBounds(vp),everyNthFrame:1});
  });
  screencastChain = run;
  return run;
}

function mirrorTeardown(notify: boolean): void {
  mirrorLastFrame = null;
  mirrorWantVp = null;
  mirrorMismatchSince = 0;
  const ws = mirrorWs;
  // Hand the tab back at its natural size — the agent keeps using it after the
  // pane closes, and leaving our pane's shape imposed on it would be rude.
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ id: ++mirrorMsgId, method: "Emulation.clearDeviceMetricsOverride", params: {} }));
    } catch {
      /* closing anyway */
    }
  }
  mirrorWs = null;
  for (const p of mirrorPending.values()) p.reject(new Error("mirror closed"));
  mirrorPending.clear();
  try {
    ws?.close();
  } catch {
    /* already gone */
  }
  if (notify) send("agentmirror:state", { connected: false });
}

/** Attach to the most recently active page tab and start streaming frames.
 *  maxWidth/maxHeight bound the JPEG Chrome renders — the pane's size, so a
 *  small pane never pays for 4K frames. */
async function mirrorStart(maxWidth: number, maxHeight: number): Promise<{ ok: boolean; error?: string }> {
  mirrorTeardown(false);
  try {
    const res = await fetch(`http://127.0.0.1:${AGENT_CHROME_PORT}/json/list`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { ok: false, error: `CDP list failed (${res.status})` };
    const targets = (await res.json()) as CdpTarget[];
    const page = pickMirrorTarget(targets);
    if (!page) {
      // Two different situations, and telling the user "the browser is not
      // open" for the second one is simply false — the browser is open, this
      // conversation just has no tab in it yet.
      const hasPages = targets.some((t) => t.type === "page");
      send("agentmirror:state", { connected: false, reason: hasPages ? "no-tab" : "no-browser" });
      return { ok: false, error: hasPages ? "this conversation has no browser tab yet" : "no page tab to mirror" };
    }
    mirrorTargetId = page.id ?? null;

    const ws = new WebSocket(page.webSocketDebuggerUrl!);
    mirrorWs = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("CDP socket failed to open"));
    });
    ws.onclose = () => {
      if (mirrorWs === ws) mirrorTeardown(true);
    };
    ws.onmessage = (ev) => {
      if (mirrorWs !== ws) return;
      let msg: { id?: number; method?: string; result?: unknown; error?: { message?: string }; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const p = mirrorPending.get(msg.id);
        if (p) {
          mirrorPending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message ?? "CDP error"));
          else p.resolve(msg.result);
        }
        return;
      }
      if (msg.method === "Page.screencastFrame" && msg.params) {
        const { data, metadata, sessionId } = msg.params as {
          data: string;
          metadata: { deviceWidth: number; deviceHeight: number };
          sessionId: number;
        };
        // Ack immediately or Chrome stops sending after a handful of frames.
        void mirrorCall("Page.screencastFrameAck", { sessionId }).catch(() => {});
        mirrorLastFrame = { width: metadata.deviceWidth, height: metadata.deviceHeight };
        if (mirrorShapeWrong(mirrorLastFrame)) {
          if (!mirrorMismatchSince) mirrorMismatchSince = Date.now();
          void mirrorCorrectViewport();
          // Withhold the transitional frame: the renderer sizes the image from
          // these dimensions, so forwarding one is what makes the pane visibly
          // jump. The previous good frame stays on screen instead.
          if (Date.now() - mirrorMismatchSince < MIRROR_SHAPE_GRACE_MS) return;
        } else {
          mirrorMismatchSince = 0;
        }
        send("agentmirror:frame", {
          sessionId: mirrorViewRoot,
          src: `data:image/jpeg;base64,${data}`,
          width: metadata.deviceWidth,
          height: metadata.deviceHeight,
        });
      } else if (msg.method === "Page.frameNavigated" && msg.params) {
        const frame = (msg.params as { frame?: { parentId?: string; url?: string } }).frame;
        if (frame && !frame.parentId) send("agentmirror:state", { connected: true, url: frame.url ?? "" });
      }
    };

    await mirrorCall("Page.enable");
    // A background tab is not painted, so the screencast emits NOTHING — the
    // pane sat on "Waiting for the first frame…" forever while the agent
    // worked in a tab Chrome had parked. Measured: 0 frames hidden, 7 in 2.5s
    // after this call. Both are best-effort: neither is worth failing on.
    await mirrorCall("Page.bringToFront").catch(() => {});
    await mirrorCall("Page.setWebLifecycleState", { state: "active" }).catch(() => {});
    const vp = await mirrorApplyViewport(maxWidth, maxHeight, mirrorSize.dpr);
    await restartScreencast(vp);
    send("agentmirror:state", { connected: true, url: page.url, title: page.title });
    return { ok: true };
  } catch (err) {
    mirrorTeardown(false);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Modifier bitmask (alt 1, ctrl 2, meta 4, shift 8) is computed renderer-side
// from the DOM event and passed through verbatim.
type MirrorInput =
  | { kind: "mouse"; type: "mousePressed" | "mouseReleased" | "mouseMoved"; x: number; y: number; button: "left" | "middle" | "right" | "none"; clickCount: number; modifiers: number }
  | { kind: "wheel"; x: number; y: number; deltaX: number; deltaY: number; modifiers: number }
  | { kind: "text"; text: string }
  | { kind: "key"; type: "rawKeyDown" | "keyUp"; key: string; code: string; keyCode: number; modifiers: number; text?: string };

async function mirrorInput(ev: MirrorInput): Promise<void> {
  if (ev.kind === "mouse") {
    await mirrorCall("Input.dispatchMouseEvent", {
      type: ev.type,
      x: ev.x,
      y: ev.y,
      button: ev.button,
      clickCount: ev.clickCount,
      modifiers: ev.modifiers,
    });
  } else if (ev.kind === "wheel") {
    await mirrorCall("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: ev.x,
      y: ev.y,
      deltaX: ev.deltaX,
      deltaY: ev.deltaY,
      modifiers: ev.modifiers,
    });
  } else if (ev.kind === "text") {
    // insertText types verbatim into the focused element and needs no key
    // mapping — the reliable path for printable characters.
    await mirrorCall("Input.insertText", { text: ev.text.slice(0, 1024) });
  } else {
    await mirrorCall("Input.dispatchKeyEvent", {
      type: ev.type,
      key: ev.key,
      code: ev.code,
      windowsVirtualKeyCode: ev.keyCode,
      nativeVirtualKeyCode: ev.keyCode,
      modifiers: ev.modifiers,
      ...(ev.text !== undefined ? { text: ev.text, unmodifiedText: ev.text } : {}),
    });
  }
}

function agentBrowserBin(): string | null {
  const path = join(options.browserRoot, "agent-browser");
  return existsSync(path) ? path : null;
}
// Gated sites (X, LinkedIn, Instagram, Reddit at times) return a SHORT page
// dominated by sign-in or verification copy. Detecting that and saying what
// to do next beats letting the model retry the same wall.
// Sign-in copy, bot checks, AND outright refusals: sites increasingly answer
// an automated browser with an HTTP error rather than a wall (x.com does),
// which is exactly when the model most needs to be told not to retry.
const BROWSER_WALL_SIGNALS =
  /(sign in|log in|log into|sign up|create account|join today|verify you are human|are you a robot|unusual traffic|captcha|complete the following challenge|enable javascript|access denied|403 forbidden|rate limit|too many requests|navigation failed|net::err_|http error)/i;
function browserWallHint(out: string): string {
  if (out.length > 2500 || !BROWSER_WALL_SIGNALS.test(out)) return "";
  return (
    "\n\n[note] This looks like a logged-out wall or a bot check rather than the real content. " +
    "Do not retry the same URL. Either use browser_search to find public sources that do not need an " +
    "account (Wikipedia, news coverage, the site's own about/help pages), or tell the user you need " +
    "their signed-in browser and ask whether to attach to it with browser_connect."
  );
}

const browserCLINamespace = `unbiased-${process.pid}-${randomUUID().slice(0, 8)}`;
function browserCLIEnv() {
  return {
    ...process.env,
    AGENT_BROWSER_NAMESPACE: browserCLINamespace,
    // A disconnected CLI must fail instead of starting an unsupervised browser.
    AGENT_BROWSER_EXECUTABLE_PATH: privateBrowser().denyDirectLaunch,
  };
}

function runAgentBrowser(args: string[], timeoutMs = 60_000): Promise<{ ok: boolean; out: string }> {
  const bin = agentBrowserBin();
  if (!bin)
    return Promise.resolve({
      ok: false,
      // Actionable, because this text is what the model relays to the user. A
      // bare "not installed" got paraphrased as "I have no browser", which is
      // the wrong conclusion — the browser is missing, not absent by design.
      out:
        "The Agent browser is unavailable: its pinned controller artifact is missing. " +
        "Tell the user to reinstall Unbiased, or rebuild the browser runtime artifacts in development. Do not try to " +
        "browse with shell commands instead.",
    });
  return new Promise((resolve) =>
    execFile(bin, browserConnectedEndpoint && args[0] !== "connect" && args[0] !== "close"
      ? [...args, "--cdp", browserConnectedEndpoint] : args,
    { timeout: timeoutMs, maxBuffer: 4_000_000, env: browserCLIEnv() }, (err, stdout, stderr) =>
      resolve({
        ok: !err,
        out: [stdout, stderr].map((x) => String(x).trim()).filter(Boolean).join("\n") || (err ? String(err) : ""),
      }),
    ),
  );
}

// Bing is the one major engine that serves an automated Chrome real results
// (Google, Brave, Ecosia and DuckDuckGo's no-JS endpoints all answer with a
// bot challenge, which we neither solve nor work around). Result titles come
// from textContent — innerText reads empty in this context — and Bing's
// redirect wrappers are decoded back to the real destination so the model
// gets URLs it can actually open.
const BROWSER_SEARCH_EXTRACT = `(() => {
  const real = (href) => { try {
    const u = new URL(href).searchParams.get("u");
    if (!u) return href;
    const b = u.replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/");
    const s = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    return /^https?:/.test(s) ? s : href;
  } catch { return href; } };
  const txt = (el, sel) => (el.querySelector(sel)?.textContent || "").replace(/\\s+/g, " ").trim();
  const rows = Array.from(document.querySelectorAll("li.b_algo")).slice(0, 8).map((li) => {
    const a = li.querySelector("h2 a[href]") || li.querySelector("a[href]");
    return {
      title: txt(li, "h2") || txt(li, "a"),
      url: a ? real(a.href) : txt(li, "cite"),
      snippet: txt(li, ".b_caption p") || txt(li, "p"),
    };
  }).filter((r) => r.title || r.url);
  return JSON.stringify(rows);
})()`;

/** agent-browser prints eval results JSON-encoded, so a string return arrives
 *  double-encoded; unwrap until it parses to an array. */
function parseEvalJson(out: string): { title?: string; url?: string; snippet?: string }[] {
  let value: unknown = out.trim();
  for (let i = 0; i < 3; i++) {
    if (typeof value !== "string") break;
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as { title?: string }[]) : [];
}

/** Double-quoted phrases in a search query — the parts Bing is being asked to
 *  match verbatim. Only runs of 3+ characters count, so a stray quote pair
 *  cannot manufacture a phrase. */
function quotedPhrases(query: string): string[] {
  const out: string[] = [];
  const re = /"([^"]{3,})"/g;
  for (let m = re.exec(query); m; m = re.exec(query)) {
    const phrase = m[1].trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

/** Comparable form for phrase matching. Punctuation has to go: Bing renders
 *  its own dashes and drops colons from titles, so "Thomson: Continual" on the
 *  page may well be "Thomson Continual" in the DOM. Letters, digits and single
 *  spaces are the only parts that survive that reliably. */
function searchNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Quoted phrases that appear in NO result. Bing silently relaxes an
 *  exact-phrase query when nothing matches it — it drops the quotes, returns
 *  broad keyword hits, and sets none of the markers it normally uses to say so
 *  (#sp_requery, #sp_recourse, .b_no, "No results found for" all stay absent,
 *  measured). So the only way to know is to check the results ourselves. */
function unmatchedPhrases(query: string, rows: { title?: string; url?: string; snippet?: string }[]): string[] {
  const phrases = quotedPhrases(query);
  if (phrases.length === 0) return [];
  const haystacks = rows.map((r) => searchNorm(`${r.title ?? ""} ${r.snippet ?? ""} ${r.url ?? ""}`));
  return phrases.filter((phrase) => {
    const needle = searchNorm(phrase);
    return needle !== "" && !haystacks.some((h) => h.includes(needle));
  });
}

function webUrlOrNull(raw: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A CDP endpoint browser_connect may attach to: a local port, or a ws/http
 *  URL on this machine. Remote hosts are refused — attaching to someone
 *  else's debugger is not a thing the model gets to choose. */
function cdpTargetOrNull(raw: string): { port: number } | { url: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return { port: AGENT_CHROME_PORT };
  if (/^\d+$/.test(trimmed)) {
    const port = Number(trimmed);
    return port > 0 && port < 65_536 ? { port } : null;
  }
  try {
    const u = new URL(trimmed);
    if (!["ws:", "wss:", "http:", "https:"].includes(u.protocol)) return null;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname)) return null;
    return { url: u.toString() };
  } catch {
    return null;
  }
}

async function fillFieldSafely(
  mode: "fill" | "type",
  refArg: string,
  value: string,
): Promise<{ ok: boolean; out: string }> {
  if (!value.startsWith("-")) return runAgentBrowser([mode, refArg, value]);
  const focused = await runAgentBrowser(["focus", refArg]);
  if (!focused.ok || /✗/.test(focused.out)) return focused;
  const js = `(() => {
  const el = document.activeElement;
  if (!el || !("value" in el)) return "not-a-field";
  const text = ${JSON.stringify(value)};
  const next = ${mode === "fill" ? "text" : '(el.value || "") + text'};
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()`;
  const r = await runAgentBrowser(["eval", js]);
  if (!r.ok || !/ok/.test(r.out)) {
    return { ok: false, out: `Could not enter text starting with "-": ${r.out || "no detail"}` };
  }
  return { ok: true, out: "✓ entered (value set in-page: text beginning with a dash cannot be typed via the CLI)" };
}


const AGENT_BROWSER_OUTPUT_CAP=30000;
async function handleAgentBrowserCall(
  tool: string,
  rawArgs: unknown,
  threadId: string | null,
): Promise<DynamicToolResponse> {
  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  const ref = () => (str("ref").startsWith("@") ? str("ref") : `@${str("ref")}`);
  const text = (t: string, ok: boolean): DynamicToolResponse => ({
    contentItems: [{ type: "inputText", text: t.slice(0, AGENT_BROWSER_OUTPUT_CAP) || (ok ? "ok" : "failed") }],
    success: ok,
  });
  // Any approved browser tool means the agent is about to browse — that, not
  // Chrome's launch, is the moment to show the user what it is doing. Launch
  // was the wrong trigger: Chrome usually already exists by the second task,
  // so the pane never opened again for the rest of the session. Denied calls
  // fall out above, so this only fires for browsing that actually happens.
  // Still withheld for a browser the user already had open — auto-mirroring
  // someone's personal Chrome and its tabs stays opt-in.
  // Every tool that needs a live page attaches first. browser_connect does its
  // own (richer) attach, and browser_close must not resurrect a browser it is
  // about to shut down.
    if (tool !== "browser_connect" && tool !== "browser_close") {
    // Inside the lock: browserSessionBound is read, then set after two awaits,
    // so two conversations arriving together could both pass the guard and
    // attach twice — launching or adopting a browser the other is already
    // using. Harmless with one conversation, which is why it was fine before
    // per-conversation tabs made concurrency the normal case.
    const failure = await withBrowserLock(() => ensureBrowserSession());
    if (failure) return text(failure, false);
  }
  // Carries the conversation, so the pane only springs open for the chat the
  // user is actually looking at. Without it a background chat's browsing
  // popped the Agent browser onto whichever conversation was on screen.
  if (!browserAttachedExternal) send("agentmirror:activity", { tool, threadId: threadId });
  // Remember where the agent is going, so the mirror follows it rather than
  // whatever tab happens to sort first.
  if (tool === "browser_open") {
    const target = webUrlOrNull(str("url"));
    if (target) mirrorPreferredUrl = target;
  }
  // Everything below runs against ONE tab, chosen for this conversation and
  // held for the whole call. browser_connect and browser_close are excluded:
  // they act on the session rather than a page, and close must not create a
  // tab on its way to shutting the browser down.
  const root = threadId;
  const tabScoped = root !== null && tool !== "browser_connect" && tool !== "browser_close";
  return withBrowserLock(async (): Promise<DynamicToolResponse> => {
    if (tabScoped) {
      const failure = await selectConversationTab(root);
      if (failure) return text(failure, false);
      // Deliberately does NOT steer the mirror. The pane follows the
      // conversation the user is looking at; a call from a background chat
      // must not drag the view onto its page.
    }
    const result = await runBrowserTool();
    // A click can open the real destination in a NEW tab — Slack's workspace
    // "Launch" does — and the CLI follows it. Adopt that tab as the
    // conversation's, or the registry (and with it the mirror, and any later
    // re-select) stays pointed at the page the agent already left: the pane
    // showed the workspace picker while the agent worked elsewhere.
    if (tabScoped && (tool === "browser_click" || tool === "browser_press")) {
      const entry = browserTabs.get(root);
      if (entry) {
        const r = await runAgentBrowser(["tab", "list", "--json"], 15_000);
        try {
          const parsed = JSON.parse(r.out) as { data?: { tabs?: { active?: boolean; targetId?: string }[] } };
          const active = (parsed.data?.tabs ?? []).find((t) => t.active);
          if (typeof active?.targetId === "string" && active.targetId !== entry.targetId) {
            entry.targetId = active.targetId;
          }
        } catch {
          /* adoption is best-effort; the click's own result already returned */
        }
      }
    }
    return result;
  });

  async function runBrowserTool(): Promise<DynamicToolResponse> {
  switch (tool) {
    case "browser_open": {
      const url = webUrlOrNull(str("url"));
      if (!url) {
        return text(
          `Refused: ${JSON.stringify(str("url"))} is not an http(s) web address. The browser only opens web ` +
            "pages — it cannot read local files or other schemes. Use the file tools for anything on disk.",
          false,
        );
      }
      const r = await runAgentBrowser(["open", url], 90_000);
      return text(r.out + browserWallHint(r.out), r.ok);
    }
    case "browser_snapshot": {
      const r = await runAgentBrowser(["snapshot"]);
      return text(r.out + browserWallHint(r.out), r.ok);
    }
    case "browser_read": {
      const r = await runAgentBrowser(["read"]);
      return text(r.out + browserWallHint(r.out), r.ok);
    }
    case "browser_search": {
      const query = str("query");
      if (!query) return text("query is required", false);
      const opened = await runAgentBrowser(
        ["open", `https://www.bing.com/search?q=${encodeURIComponent(query)}`],
        90_000,
      );
      if (!opened.ok) return text(opened.out, false);
      await runAgentBrowser(["wait", "1200"], 20_000);
      const evaluated = await runAgentBrowser(["eval", BROWSER_SEARCH_EXTRACT]);
      const rows = parseEvalJson(evaluated.out);
      if (rows.length === 0) {
        // Empty means a challenge page or a query with no hits — show the
        // model what is actually on screen so it can adapt.
        const page = await runAgentBrowser(["read"]);
        const seen = page.out.slice(0, 1200);
        return text(
          `No results could be extracted for ${JSON.stringify(query)}.\n\nWhat the page shows:\n${seen}` +
            (browserWallHint(seen) || "\n\n[note] Try a differently worded query, or open a known source directly."),
          false,
        );
      }
      const list = rows
        .map((r, i) => `${i + 1}. ${r.title ?? "(untitled)"}\n   ${r.url ?? ""}\n   ${r.snippet ?? ""}`.trimEnd())
        .join("\n\n");
      // A relaxed exact-phrase query is worse than an empty one: the results
      // look confident and well-formed while answering a different question,
      // and the `rows.length === 0` guard above never fires because Bing
      // returns a full page of them. The dangerous case is an exact-title
      // search used to check whether something exists — relaxation turns "no
      // such thing" into ten plausible citations. Results are still returned
      // (they are real pages, and a long phrase can be missing from a
      // truncated snippet even on a genuine match), but the framing is
      // corrected before the model reads them.
      const unmatched = unmatchedPhrases(query, rows);
      const warning =
        unmatched.length === 0
          ? ""
          : `[warning] No result contains the exact phrase ${unmatched.map((p) => JSON.stringify(p)).join(" or ")}. ` +
            "Bing drops quotes when a phrase has no matches and gives no signal that it did, so read this as " +
            "\"no source found for that exact wording\" — do NOT cite these results as confirming the phrase " +
            "exists. Open a result to check, or search again with distinctive keywords instead of a quoted phrase.\n\n";
      return text(
        `${warning}Results for ${JSON.stringify(query)}:\n\n${list}\n\n[next] browser_open one of these URLs to read it, ` +
          "or browser_snapshot this results page to click a link. Cross-check anything important against a second source.",
        true,
      );
    }
    case "browser_connect": {
      const target = cdpTargetOrNull(str("port"));
      if (!target) {
        return text(
          `Refused: ${JSON.stringify(str("port"))} is not a local debugging target. Pass a port number, or a ` +
            "ws://127.0.0.1 URL — attaching to a remote host is not allowed.",
          false,
        );
      }
      let launched = false;
      let firstRun = false;
      let connectArg: string;
      if ("url" in target) {
        connectArg = target.url; // someone else already serves this endpoint
      } else {
        // Approved above — now make a debuggable browser exist. Nothing for
        // the user to run: an already-listening browser is reused, otherwise
        // we start Unbiased's own Chrome and wait for its port.
        const ready = await cdpAlive(target.port) && !(await ownsChromeOnPort(target.port))
          ? { ok: true, launched: false, firstRun: false }
          : await ensureAgentChrome(target.port);
        if (!ready.ok) {
          return text(
            `Could not start a browser session: ${ready.error ?? "unknown error"}. ` +
              "Use browser_search and public pages instead.",
            false,
          );
        }
        launched = ready.launched;
        firstRun = ready.firstRun;
        connectArg = String(target.port);
      }
      const r = await runAgentBrowser(["connect", connectArg], 30_000);
      // `connect` exits 0 even when discovery fails, so read the output.
      if (!r.ok || /✗|failed|refused/i.test(r.out)) {
        // Don't leave a window open for a session that never attached.
        if (launched && managedChrome) {
          await stopManagedChrome();
        }
        return text(`Attach failed on ${connectArg}: ${r.out || "no detail"}`, false);
      }
      // Only a browser of OURS is ours to close later. Not the same as "we
      // launched it this time": our managed Chrome survives an unclean exit,
      // and treating that leftover as the user's browser is what suppressed
      // the mirror pane for the rest of the session.
      browserAttachedExternal =
        "url" in target ? true : launched ? false : !(await ownsChromeOnPort(target.port));
      browserSessionBound = true;
      browserConnectedEndpoint = connectArg;
      if (launched && firstRun) {
        return text(
          "Attached to a freshly created private Unbiased Browser profile. It is available in the Agent browser side panel, " +
            "but it is NOT signed into anything yet. Sign-ins from the old automation browser are not imported. Tell the user to " +
            "sign in to the site you need in the Agent browser, then continue. Do not guess credentials or ask " +
            "them to type any password to you.",
          true,
        );
      }
      return text(
        (launched
          ? "Attached to the private Unbiased Browser in the Agent browser side panel. It may already hold " +
            "sign-ins from earlier sessions."
          : "Attached to the browser already listening on that endpoint.") +
          " If a page comes back signed out, ask the user to sign in in that window rather than looking for " +
          "another way around it.",
        true,
      );
    }
    case "browser_click": {
      const r = await runAgentBrowser(["click", ref()]);
      return text(r.out, r.ok);
    }
    case "browser_fill": {
      const r = await fillFieldSafely("fill", ref(), str("text"));
      return text(r.out, r.ok);
    }
    case "browser_type": {
      const r = await fillFieldSafely("type", ref(), str("text"));
      return text(r.out, r.ok);
    }
    case "browser_press": {
      const key = str("key");
      // Key names and chords only — nothing that could read as a CLI flag.
      if (!/^[A-Za-z0-9+_]{1,40}$/.test(key)) {
        return text(`Refused: ${JSON.stringify(key)} is not a key name (try Enter, Tab, Control+a).`, false);
      }
      const r = await runAgentBrowser(["press", key]);
      return text(r.out, r.ok);
    }
    case "browser_scroll": {
      const px = typeof a.pixels === "number" && a.pixels > 0 ? [String(Math.round(a.pixels))] : [];
      const dir = str("direction") || "down";
      if (!["up", "down", "left", "right"].includes(dir)) {
        return text(`Refused: direction must be up, down, left or right (got ${JSON.stringify(dir)}).`, false);
      }
      const r = await runAgentBrowser(["scroll", dir, ...px]);
      return text(r.out, r.ok);
    }
    case "browser_back": {
      const r = await runAgentBrowser(["back"]);
      return text(r.out, r.ok);
    }
    case "browser_close": {
      if (browserAttachedExternal) {
        return text("Attached to a browser this app did not launch — leaving it open. Nothing to close.", true);
      }
      await gracefulBrowserClose();
      const r = await runAgentBrowser(["close"]);
      // A browser we launched goes down with the session, closing its
      // debugging port too — leaving that open all session is what let any
      // local process attach to the signed-in profile.
      if (managedChrome) {
        await stopManagedChrome();
      }
      // The CLI session is no longer bound to anything; the next browser tool
      // has to attach again rather than assuming a live page.
      browserSessionBound = false;
      browserConnectedEndpoint = null;
      // Every conversation's tab went with the browser. Keeping the registry
      // would hand the next call a label that no longer exists, and the
      // recovery path would then quietly create a tab in a browser we just
      // told the user we had closed.
      browserTabs.clear();
      browserActiveRoot = null;
      return text(r.out || "closed", r.ok);
    }
    case "browser_screenshot": {
      const file = join(options.tempDir, `unbiased-shot-${Date.now()}.png`);
      const r = await runAgentBrowser(["screenshot", file], 90_000);
      if (!r.ok) return text(r.out, false);
      try {
        const b64 = readFileSync(file).toString("base64");
        return { contentItems: [{ type: "inputImage", imageUrl: `data:image/png;base64,${b64}` }], success: true };
      } catch (err) {
        return text(`screenshot unreadable: ${String(err)}`, false);
      } finally {
        rmSync(file, { force: true });
      }
    }
    default:
      return text(`unknown tool: ${tool}`, false);
  }
  }
}

  async function mirrorTick(): Promise<{ ok: boolean; error?: string }> {
    if (!mirrorDesired || mirrorAttaching) return { ok: !!mirrorWs };
    if (mirrorWs) {
      // Still attached — make sure the target still exists. A closed tab does
      // not always deliver a socket close promptly.
      try {
        const res = await fetch(`http://127.0.0.1:${AGENT_CHROME_PORT}/json/list`, {
          signal: AbortSignal.timeout(2_000),
        });
        const targets = (await res.json()) as CdpTarget[];
        const best = pickMirrorTarget(targets);
        // Re-attach when our tab is gone OR when the agent has moved to a
        // better one — opening a new tab used to leave the pane on the old.
        if (mirrorTargetId && (!targets.some((t) => t.id === mirrorTargetId) || (best?.id && best.id !== mirrorTargetId))) {
          mirrorTeardown(true);
        } else if (mirrorWs) {
          // Chrome can park our tab again whenever another one comes forward,
          // and a parked tab silently stops painting. Cheap to reassert.
          await mirrorCall("Page.bringToFront").catch(() => {});
          // Backstop only: the frame handler corrects a wrong shape within one
          // frame. This catches the case where frames have stopped arriving
          // altogether, so nothing is left to trigger that path.
          if (mirrorShapeWrong(mirrorLastFrame)) await mirrorCorrectViewport();
        }
      } catch {
        mirrorTeardown(true); // Chrome went away
      }
      return { ok: !!mirrorWs };
    }
    mirrorAttaching = true;
    try {
      return await mirrorStart(mirrorSize.width, mirrorSize.height);
    } finally {
      mirrorAttaching = false;
    }
  }
  function mirrorSupervise(): void {
    if (mirrorTimer) return;
    mirrorTimer = setInterval(() => void mirrorTick(), 1_500);
    mirrorTimer.unref?.();
  }


  async function releaseConversationTab(rootId: string): Promise<void> {
    const entry = browserTabs.get(rootId);
    if (!entry) return;
    browserTabs.delete(rootId);
    if (browserActiveRoot === rootId) browserActiveRoot = null;
    if (browserSessionBound && !browserAttachedExternal) {
      await runAgentBrowser(["tab", "close", entry.label], 15_000).catch(() => undefined);
    }
  }


async function gracefulBrowserClose(): Promise<void> {
  if (!managedChrome || !(await ownsChromeOnPort(AGENT_CHROME_PORT))) return;
  const guardian = managedChrome;
  try {
    const response = await fetch(`http://127.0.0.1:${AGENT_CHROME_PORT}/json/version`, {signal:AbortSignal.timeout(1000)});
    const version = await response.json() as {webSocketDebuggerUrl?:string};
    if (!version.webSocketDebuggerUrl) return;
    await new Promise<void>(resolve => {
      const ws = new WebSocket(version.webSocketDebuggerUrl!);
      const done = () => { clearTimeout(timer); try{ws.close();}catch{} resolve(); };
      const timer=setTimeout(done,1000);
      ws.onopen=()=>ws.send(JSON.stringify({id:1,method:"Browser.close"}));
      ws.onclose=done; ws.onerror=done;
    });
    // CDP closes its socket before Chrome has necessarily flushed its profile.
    // Let the guardian observe natural browser exit before ending its lease.
    if (guardian.exitCode === null && guardian.signalCode === null) {
      await new Promise<void>(resolve => {
        const done=()=>{clearTimeout(timer);resolve();};
        const timer=setTimeout(done,2500);guardian.once("exit",done);
      });
    }
  } catch { /* the native guardian remains the bounded shutdown backstop */ }
}

async function shutdown() {
  browserShuttingDown = true;
  mirrorDesired = false;
  if (mirrorTimer) { clearInterval(mirrorTimer); mirrorTimer = null; }
  mirrorTeardown(false);
  await gracefulBrowserClose();
  if (agentBrowserBin() && !browserAttachedExternal) await runAgentBrowser(["close", "--all"], 2000);
  await stopManagedChrome();
  return { ok: managedChrome === null };
}
return {
  capabilities: () => ({ protocolVersion: 1, runtimeVersion: "0.1.0", tools: agentBrowserBin() && existsSync(privateBrowser().executable) && existsSync(privateBrowser().supervisor) ? AGENT_BROWSER_TOOLS : [], features: ["tools", "conversation-tabs", "screencast", "input", "managed-lifetime"], platform: process.platform }),
  execute: (p: {tool:string; args:unknown; sessionId:string|null}) => handleAgentBrowserCall(p.tool, p.args, p.sessionId),
  release: (p: {sessionId:string}) => withBrowserLock(() => releaseConversationTab(p.sessionId)),
  reset: () => withBrowserLock(async () => { await shutdown(); browserAttachedExternal=false; browserSessionBound=false; browserConnectedEndpoint=null; browserTabs.clear(); browserActiveRoot=null; browserShuttingDown=false; return {ok:true}; }),
  mirrorStart: async (p: {width:number;height:number;dpr:number;sessionId:string|null}) => {
    mirrorDesired=true; mirrorViewRoot=p.sessionId;
    mirrorSize={width:p.width,height:p.height,dpr:p.dpr}; mirrorSupervise(); return mirrorTick();
  },
  mirrorStop: async () => { mirrorDesired=false; if(mirrorTimer){clearInterval(mirrorTimer);mirrorTimer=null;} mirrorTeardown(false); return {ok:true}; },
  mirrorResize: async (p: {width:number;height:number;dpr:number}) => {
    mirrorSize=p; if(!mirrorWs) return {ok:false};
    const vp=await mirrorApplyViewport(p.width,p.height,p.dpr);
    await restartScreencast(vp); return {ok:true};
  },
  mirrorInput: async (p: MirrorInput) => { await mirrorInput(p); return {ok:true}; },
  shutdown,
};
}
