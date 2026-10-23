# Browser runtime 0.1

This is a standalone Node process inside the desktop repository, not a new repo
or a deployed cloud service. It owns browser startup/cleanup, the controller CLI,
conversation-to-tab bindings, browser tools, screenshots, screencast frames and
normalized mouse/keyboard input. `core.ts` imports only Node built-ins and sibling
runtime modules; it does not import Electron, the Go wrapper or desktop state.

Desktop keeps permission prompts, account policy, local/cloud routing and mapping
chat IDs to opaque runtime session IDs. It reads tool definitions from the runtime
handshake before starting its engine session. Renderer IPC calls are adapted to
the same runtime interface; raw CDP and CLI commands are not public operations.

## Build and run without Electron

```sh
npm ci
npm run prepare:browser
npm run build
node out/main/browser-runtime.js
```

The process reads one JSON request per line from stdin, and writes responses and
events as JSON lines to stdout. Diagnostics use stderr. Node 22+ is required;
the current browser/guardian artifacts support macOS arm64 and macOS 13+.
There is no HTTP listener, published port, account authentication or cloud SDK.

Send initialization first, using absolute paths owned by the host:

```json
{"id":1,"method":"initialize","params":{"protocolVersion":1,"options":{"browserRoot":"/checkout/build/browser-bundle","home":"/runtime/user-home","tempDir":"/runtime/tmp","osVersion":"13.0","port":9222}}}
```

Both home and temp directories must already exist. Browser profile data lives in
`home/.unbiased/browser-profile`. The host chooses one private home per owner;
conversation tabs within that browser share website sign-ins. A session ID is a
tab-routing label, not a tenant/security boundary.

Initialization returns protocol/runtime versions, supported tool definitions,
feature names and platform. The browser starts lazily on the first approved tool.
The host must reject incompatible protocol versions. Available methods:

| Method | Parameters | Result |
|---|---|---|
| `capabilities` | `{}` | Tool catalog and protocol/runtime metadata |
| `tool.execute` | `{tool,args,sessionId}` | Existing text/image tool result |
| `session.release` | `{sessionId}` | Release the conversation's tab |
| `session.reset` | `{}` | Stop the managed browser, clear tabs and attachments |
| `view.start` | `{sessionId,width,height,dpr}` | Watch this conversation's tab |
| `view.resize` | `{width,height,dpr}` | Resize the active view |
| `view.input` | Normalized mouse, wheel, text or key input | Input result |
| `view.stop` | `{}` | Disconnect the viewer; keep browser work running |
| `shutdown` | `{}` | Stop owned browser processes and exit |

Responses are `{id,result}` or `{id,error}`. Events are `{event,payload}` using
`agentmirror:frame`, `agentmirror:state` and `agentmirror:activity`. Frame payloads
contain `sessionId`, JPEG data URL and dimensions. Frames from replaced CDP
connections are ignored. Slow readers cause intermediate frames to be dropped;
tool responses are not dropped. View operations remain responsive while a tool
is navigating. Tool/session commands are serialized to keep tab selection and
execution together; clients must not automatically replay an interrupted action.

Requests have bounded sizes/queue depth and an allowlist of tools and normalized
input. Arbitrary native commands, CLI options and raw CDP methods are rejected.
The private stdio channel trusts its host to obtain consent before execution.
It must not be exposed directly to an untrusted renderer, web user or network.

## Host adapter and lifetime

`src/main/browser-runtime-client.ts` is a Node-only client. Desktop runs the entry
point with its bundled Node runtime (`ELECTRON_RUN_AS_NODE=1`). An ordinary Node
host can run the same entry point directly; the integration smoke test does so.
Packaging copies the entry and shared chunks outside `app.asar` into
`Contents/Resources/browser-runtime/`, with browser assets in the adjacent
`browser/` directory. Both folders form the local runtime distribution.

When the host dies/closes stdin, the runtime stops its owned browser and exits.
If the runtime itself is killed, its native guardian detects lease closure and
cleans up. Restart waits briefly for the old guardian's profile lock to clear.
Interrupted requests fail instead of being replayed. A viewer intent is restored
on the next runtime connection, while the browser profile persists across runs.
Normal shutdown requests `Browser.close` and waits for profile flushing before
ending the guardian lease. The smoke test checks cookie persistence across this
path. An abrupt crash can still lose recent browser writes that were not flushed.
External browser attachments are disconnected without terminating that browser.

The cloud host will own this lifetime channel; closing a web viewer must map to
`view.stop`, not to closing the host's channel or killing the runtime.

## Tests and next boundary

`npm run smoke:browser-runtime` uses only Node and a local fixture server. It
checks discovery, two-chat tab isolation, snapshots/click refs, typed input,
frames, resizing, screenshots, validation, runtime SIGKILL/restart and cleanup
after host SIGKILL, plus cookies across graceful shutdown. Unit tests cover handshake/version failure, response matching,
events, request validation and refusal to replay lost actions. The desktop can
still be launched with `npm run dev` for the existing viewer and approval flow.

This milestone does not ship Linux browser/guardian artifacts, authenticated
network transport, cloud scheduling/profile storage, web UI or per-user service
authorization. Those adapters must enforce ownership on every operation and
stream, and preserve the same versioned interface. Moving this component to a
separate repo comes after desktop integration and review of this boundary.
