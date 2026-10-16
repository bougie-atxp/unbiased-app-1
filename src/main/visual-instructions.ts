// Short, verified signatures keep the model's visual prompt smaller than the
// upstream library's full component schema. The renderer registers all of it.
export const OPENUI_PROMPT_COMPONENTS = [
  "Stack(children: element[], direction?: row|column, gap?: none|xs|s|m|l|xl|2xl): layout root and grouping",
  "TextContent(text: string, size?: small|default|large|small-heavy|large-heavy): concise Markdown text",
  "Card(children: element[], variant?: card|sunk|clear): grouped content; avoid nesting cards",
  "CardHeader(title?: string, subtitle?: string): card heading",
  "Callout(variant: info|warning|error|success|neutral, title: string, description: string): important note",
  "Tabs(items: TabItem[]): local navigation between views",
  "TabItem(value: string, trigger: string, content: element[]): one tab; content may contain text, charts, tables, and callouts",
  "Accordion(items: AccordionItem[]): expandable sections",
  "AccordionItem(value: string, trigger: string, content: element[]): one expandable section",
  "Steps(items: StepsItem[]): compact ordered instructions",
  "StepsItem(title: string, details: string): one instruction",
  "Table(columns: Col[]): column-oriented comparison",
  "Col(label: string, data: any[], type?: string|number|action): one table column",
  "BarChart(labels: string[], series: Series[], variant?: grouped|stacked): numerical comparison",
  "LineChart(labels: string[], series: Series[]): trend",
  "Series(category: string, values: number[]): chart series",
  "PieChart(labels: string[], values: number[], variant?: pie|donut): proportions",
  "Separator(orientation?: horizontal|vertical): section divider",
];

export const OPENUI_VISUAL_INSTRUCTIONS = [
  "Use visuals when they materially improve an answer, even when the user has not selected Visualize. The bundled visualize skill can guide the choice of representation and interaction; it is optional for ordinary answers.",
  "For a visual answer, include one complete fenced openui block in the final reply. It renders in chat after generation; the user sees the visual, not its source.",
  "Use OpenUI Lang, not JSON or JSX. Use positional component calls and assign exactly one root Stack. Example: root = Stack([TextContent(\"Move diagonally\"), Tabs([TabItem(\"setup\", \"Setup\", [TextContent(\"Place 12 pieces\")]), TabItem(\"move\", \"Move\", [TextContent(\"Use dark squares\")])])]).",
  "The renderer uses upstream OpenUI components, plus the app's Whiteboard, Mermaid, and VisualHtml extensions. Prefer the verified signatures below; do not guess props for other upstream components. Supply required arguments in order and omit optional trailing arguments when unnecessary. No Query, Mutation, remote media, URLs, app APIs, or tool/action calls.",
  "Choose the representation from the learning goal. Tabs or Accordion can navigate several views; Steps are for short text instructions, not a substitute for a visible diagram. For a game, physical process, or changing system, show the actual board, object, or state and what changes when the learner acts. Use a custom VisualHtml scene when a programmatic drawing, loop, or local interaction teaches better than stock components. Do not force every answer into a visual.",
  "Make the program syntactically complete and keep it under 256 KB. A VisualHtml fragment itself must be under 128 KB. Prefer a few purposeful components with concise labels over many disconnected elements.",
  "Match the Unbiased host theme for interface chrome. Standard OpenUI components inherit its surface, text, border, accent, and font tokens. In VisualHtml, use var(--visual-bg), var(--visual-fg), var(--visual-muted), and var(--visual-accent) for the fragment root, prose, and controls; the host updates them when its theme changes. Keep subject-matter colors where they teach something, with readable contrast in light and dark themes.",
  ...OPENUI_PROMPT_COMPONENTS,
  "Whiteboard(title?: string, shapes: Shape[]): editable 800x450 board. Pass a title and up to 60 shapes with unique IDs. Nodes use type circle|oval|square|rectangle|triangle and x,y,width, optional height, fill/stroke #RRGGBB, optional label. Edges use {id,type:\"connector\",from,to,optional stroke,directed,label}; from and to must identify different nodes.",
  "Mermaid(diagram: string, title?: string): complete Mermaid diagram with connected nodes and short labels. The first argument is Mermaid source, for example \"flowchart LR\\nA-->B\". Avoid click actions and external links.",
  "VisualHtml(source: string): self-contained interactive HTML fragment with inline style and script, not a document. No network, external assets, links, forms, imports, fetch, or app APIs. Use it for a custom illustration or interaction that standard components cannot express; pass the entire escaped fragment as one string. JavaScript loops may draw repeated elements such as an 8x8 board.",
  "Use normal Markdown outside the visual for brief context. Standalone mermaid and visual-html fences also render through the same visual renderer, but prefer openui when combining components.",
];

export const VISUALIZE_DIRECTIVE =
  "VISUALIZE is selected for this turn. The user explicitly wants a visual answer. " +
  "Plan a useful visual for their request and include a complete, valid fenced openui block in the final reply. " +
  "Use the bundled visualize skill when it helps, but do not spend the turn merely describing a visual you did not create. " +
  "Keep brief explanatory prose outside the visual and follow the app's OpenUI syntax and safety limits.";
