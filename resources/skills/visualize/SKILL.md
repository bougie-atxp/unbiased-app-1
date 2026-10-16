---
name: visualize
description: Create a useful visual explanation or interactive illustration in an Unbiased chat using the built-in OpenUI renderer. Use when the user asks to see how something works, compare states, follow a process, explore a map or diagram, or when a visual would make an answer substantially clearer. The user can also select Visualize in the composer to require a visual for that turn.
---

# Visual answers in Unbiased

The app's developer instructions define the available OpenUI components and
their signatures. Follow those signatures; this skill helps choose and shape
the visual, not replace the renderer's contract.

## Choose the teaching view

- Show the actual object, arrangement, or changing state as the first visual
  signal. A board should look like a board; a route should show a route.
- Give the learner one clear action or comparison. Use tabs, a slider, or
  local buttons only when changing them reveals a meaningful difference.
- Start with the core loop or a concrete first example. Put edge cases later.
- Keep labels short, legible, and high contrast in both light and dark themes.
- For a simple static relationship, a diagram or chart is enough. Do not add
  interaction solely to make it look sophisticated.

## Build for this renderer

Include one complete fenced `openui` block in the final reply. Assign exactly
one `root = Stack(...)`. Use the built-in components for prose, charts, steps,
and tabs. Use `VisualHtml` for a custom object, map, board, or interaction
that the components cannot express; its source must be one escaped,
self-contained HTML fragment, with no network access or app APIs.

For `VisualHtml`, use `--visual-bg`, `--visual-fg`, `--visual-muted`, and
`--visual-accent` for interface chrome while retaining meaningful subject
colors. Size content to its natural height and support narrow widths. Avoid
fixed viewport heights and empty space below the useful content.

Check that the program is syntactically complete, that controls change the
intended local state, and that no label is clipped or hidden. Never claim an
interaction was tested if it was not.

The agent may choose this skill itself when a visual helps. Selecting
Visualize in the composer makes the visual required for that turn; it does
not grant extra permissions or enable external resources.
