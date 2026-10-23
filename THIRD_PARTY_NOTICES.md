# Third-Party Notices

Unbiased desktop includes third-party software under its own licenses.

## OpenAI Codex

The packaged application includes an unmodified `codex-app-server` binary
from [OpenAI Codex](https://github.com/openai/codex), licensed under
Apache-2.0. Its license and NOTICE file are included in the engine bundle at
`Contents/Resources/engine/licenses/openai-codex/`.

## Electron and npm dependencies

Electron includes Chromium and Node.js notices in its distribution. The
JavaScript dependencies retain their package metadata and license files in
the packaged application. See `package-lock.json` for the exact dependency
versions used by a release.

## Agent Browser

The packaged application includes the `agent-browser` CLI from
[Vercel Labs](https://github.com/vercel-labs/agent-browser), licensed under
Apache-2.0. Its license is included at
`Contents/Resources/browser/licenses/agent-browser/LICENSE`.

## Private Agent browser

The packaged application includes a pinned
[Chrome for Testing](https://github.com/GoogleChromeLabs/chrome-for-testing)
distribution with Unbiased-specific macOS bundle identifiers and handler
registrations removed. Upstream browser resources and component notices remain
in `Contents/Resources/browser/Unbiased Browser.app`; the browser's
`chrome://credits` page lists third-party component credits. The exact artifact
and checksum are recorded in `build/browser.lock.json`.

## Robot Head Pal

The packaged application includes an adapted version of
[robot-heads](https://github.com/fayazara/robot-heads/tree/58ebf6439a8125a769f63b22ffd35bc18834b1b5)
by Fayaz Ahmed, licensed under MIT. Its copyright and license text are included
at `Contents/Resources/licenses/robot-heads/LICENSE`.
