# Agent Browser integration

The browser implementation, native guardian, artifact pin and lifecycle tests
are maintained in [unbiased-browser](https://github.com/circuitandchisel/unbiased-browser).
See that repository's README and `docs/PRIVATE-BROWSER.md` for the stdio protocol,
macOS identity, profile migration, ownership checks and security update policy.

`browser-runtime.lock.json` pins the exact source commit, package version and
protocol. `npm run prepare:browser` fetches that commit, runs its locked build,
and stages `build/browser-runtime` plus `build/browser-bundle`. Packaging places
those folders outside `app.asar` at `Contents/Resources/browser-runtime` and
`Contents/Resources/browser`. Runtime notices ship alongside the compiled code.
The browser currently supports macOS arm64, macOS 13+; other platforms do not
acquire browser tools simply by importing the client.

The desktop owns approval prompts, tool gating, local/cloud routing and the
viewer. Before starting or resuming an engine thread it discovers the runtime's
current tools, reconnecting after an unexpected runtime exit. Lost actions are
never replayed. A session ID routes a chat to its tab, and is not a tenant
security boundary.

Run `npm ci && npm run prepare:browser`, then the usual desktop commands.
Preparation requires read access to the internal browser repository. CI uses
the existing release GitHub App, which must be installed on `unbiased-browser`;
local Git credentials also work. For a local source checkout set
`UNBIASED_BROWSER_SOURCE_DIR=/absolute/path/to/unbiased-browser`; it must be clean
and its HEAD must equal the pinned revision. Uncommitted component changes must
be committed and explicitly pinned before testing them in the desktop.

`node build/prepare-browser.cjs --runtime-only` stages JavaScript/declarations
without downloading native assets, for typechecking and unit tests.
`npm run build` prepares this automatically; `npm run dev` prepares both parts.
To update the component, validate a new browser commit, change the lock, and run:

```sh
npm run prepare:browser
npm run typecheck
npm test
npm run build
npm run smoke:browser
npm run smoke:browser-runtime
npm run smoke:browser-mirror
```

The first two browser smoke commands delegate to tests owned by the pinned
component. The mirror smoke stays here and checks renderer/preload/IPC together.
Release CI repeats component smoke tests against the packaged resources.
No cloud network service or remote viewer is introduced by this extraction.
