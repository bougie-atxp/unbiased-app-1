# Visual surfaces

Assistant replies can contain a fenced `openui` program. The app parses and
validates the complete program, then renders it through one bundled OpenUI
renderer. Source remains in the transcript, so reopening a chat reconstructs
the same visual. During streaming the fence shows a stable preparation state
without exposing partial source. Invalid programs show a contained error state.

The app uses the upstream `@openuidev/react-ui` component catalogue directly.
It registers every upstream component, plus its local `Whiteboard`, `Mermaid`,
and `VisualHtml` components, in `src/renderer/src/openui-visual.tsx`. The
prompt in `src/main/visual-instructions.ts` gives the agent a concise,
verified subset of component signatures to keep generation fast and reliable;
the rest of the upstream catalogue remains available to the renderer. The
former `@unbiased/iui` wrapper and its `GuidedExplainer` are not part of this
path. The app maps OpenUI style tokens to its own theme without forking the
upstream library.

One root `Stack`, at most 40 statements/components, and a 256 KB source limit
are enforced. Unknown components, incomplete programs, queries, mutations,
remote URLs, and unsafe HTML are rejected. The renderer has no tool provider
or model-to-Electron IPC path. Upstream package updates and app extensions
must be reviewed and bundled by the app before the agent can use them.

Standalone `mermaid` and `visual-html` fences are wrapped as OpenUI components
and use the same rendering path. Mermaid runs in strict security mode. HTML
fragments are validated and mounted in an isolated, no-network frame with
scripts but no access to app APIs. The generated visual is displayed only
after its frame signals readiness. See `src/shared/interactive-visual.ts` for
the fragment validator and content security policy.

Whiteboard accepts up to 60 bounded shapes on an 800x450 board. Drawable
shapes have unique IDs, and connector edges refer to two distinct drawable
nodes. The user can move, recolor, remove, and export shapes. These edits are
local to the mounted view; the transcript retains the original program.

Example:

````markdown
```openui
root = Stack([
  TextContent("A graph connects people through friendships."),
  Mermaid("flowchart LR\nMaya --- Sam\nSam --- Lee")
])
```
````
