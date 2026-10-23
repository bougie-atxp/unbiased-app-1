# Private Agent browser

Agent Browser launches the bundled `Unbiased Browser.app`, not an installed
Chrome/Chromium/Brave/Edge. Its main and helper bundle identifiers use the
`ai.unbiased.browser` prefix. The main bundle has no URL or document handler
registrations. Changing only `--user-data-dir` did not isolate macOS link routing
from everyday Chrome; the application identity is deliberately separate too.

The full Chrome for Testing build preserves modern headless rendering and the
optional headed sign-in escape hatch. `build/browser.lock.json` pins the exact
macOS arm64 artifact and SHA-256. `npm run prepare:browser` verifies the download,
rewrites application identities, removes handler registrations, re-signs and
verifies the private browser, and compiles its native guardian. The complete
browser is copied through the existing `extraResources/browser` packaging path.
Browser automation requires macOS 13+, while the rest of the app's minimum OS
requirement is unchanged. The private browser adds approximately 366 MB unpacked.
Upstream credits remain in the browser's resources (`chrome://credits`).

## Process lifetime and ownership

Electron calls a standalone Node browser runtime over a private stdio protocol;
the runtime starts `browser-supervisor` and holds its private stdin pipe open.
The guardian forks the browser into a dedicated process
group. Browser children inherit `/dev/null`, not the lifetime pipe. Closing the
pipe (normal shutdown, app crash or SIGKILL) tells the guardian to terminate its
browser group, allow two seconds for shutdown, then kill remaining members.
The guardian reaps the root before exiting. Electron's quit/update path waits
for this cleanup, bounded to fit the existing four-second update exit guard.
Updates stop the private browser before replacing its executable/resources;
if the guardian has not exited, the update returns a retryable error.
The runtime also shuts down on host stdin closure; killing the runtime closes
the guardian's lease. See `src/browser-runtime/README.md` for the interface.

An exclusive profile lock prevents simultaneous app instances from adopting
the same browser. A process record stores the root PID and kernel process start
time. Recovery signals a leftover group only when PID/start time, exact
executable, exact profile argument and group identity all match. A stale or
reused PID alone is never authority to terminate a process. If the guardian
itself is killed, this recovery runs before the next managed launch. If both
guardian and browser root disappear, recovery does not guess ownership of
arbitrary surviving processes.

The CLI has a separate namespace per app process. Its direct-launch executable
is a refusal shim: it can connect to the supervised browser, but a disconnected
CLI cannot silently launch another browser. An occupied debugging port is not
automatically adopted. Explicit approved `browser_connect` calls can still
attach to an external browser; those browsers are never closed by Unbiased.

## Migration

New sign-ins live in `~/.unbiased/browser-profile`. The old
`~/.unbiased/chrome-profile` remains untouched on disk; existing website sign-ins
are not imported because browser identity/keychain changes can affect cookie
decryption. Users sign in once in the Agent browser again.

Before a managed launch, legacy Chrome-family roots using exactly the old
profile are checked. Only orphaned roots (parent PID 1) are gracefully stopped.
A live older app must be quit first; unrelated profiles and everyday browser
processes are never terminated. An old root that refuses to quit produces an
actionable failure rather than a broad process-name kill.

## Browser updates

Chrome for Testing does not auto-update. Before each Unbiased release, compare
the pin with Google's stable Chrome for Testing channel and review security
updates. Update version, official URL and independently checked SHA-256 together
in `build/browser.lock.json`; rebuild and run the browser smoke tests. Ship
critical browser fixes promptly through the ordinary app release path. A pinned
artifact must never be silently replaced by an unverified "latest" download.

## Validation

- `npm test`: includes compiled native lifetime tests for pipe EOF, owner
  SIGKILL, resistant descendants, exclusive ownership, PID reuse protection and
  recovery after the guardian is killed.
- `npm run prepare:browser && npm run smoke:browser`: checks identity, absent
  handlers, CLI control through CDP and refusal of unsupervised launches.
- Run `node build/smoke-browser.cjs <packaged-app>/Contents/Resources/browser`
  after packaging/signing too; release CI runs this check.
- `node build/smoke-browser-routing.cjs`: explicitly opens harmless HTTPS and
  local HTML fixtures through NSWorkspace. Checks the receiving application PID
  and bundle ID against the configured default handler, and checks that neither
  URL appears in automation tabs. Repeats after managed cleanup. This interactive
  check never restarts the user's everyday browser or changes default handlers.
- Remaining manual release matrix: repeat with normal Chrome restarted while
  automation stays alive; repeat after app force-quit, crash and update; inspect
  visible windows and confirm no automation browser processes survive. Test
  actual website sign-in and headed fallback separately from public navigation.
