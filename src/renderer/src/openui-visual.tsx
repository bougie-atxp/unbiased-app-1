import { Component, type ReactElement, type ReactNode } from "react";
import { createLibrary, createParser, defineComponent, Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { z } from "zod/v4";
import { isInteractiveVisualSource, MAX_INTERACTIVE_VISUAL_LENGTH } from "../../shared/interactive-visual";
import { InteractiveHtmlVisual } from "./interactive-html-visual";
import { GeneratedVisualViewport } from "./generated-visual-viewport";
import { openUIThemeStyle } from "./openui-theme";
import { MermaidDiagram } from "./mermaid-diagram";
import { mermaidDiagramSchema, MAX_MERMAID_LENGTH } from "./mermaid-model";
import { Whiteboard } from "./whiteboard";
import { whiteboardSchema } from "./whiteboard-model";

const WhiteboardComponent = defineComponent({
  name: "Whiteboard",
  description: "Editable spatial diagram on an 800x450 board. Use labeled shapes and connector edges for graphs. Shapes are bounded, and connector IDs must refer to distinct nodes.",
  props: whiteboardSchema,
  component: ({ props }) => <Whiteboard title={props.title} initialShapes={props.shapes} />,
});

const MermaidComponent = defineComponent({
  name: "Mermaid",
  description: "A focused Mermaid diagram. Give it complete Mermaid syntax with short labels and connected nodes. No click actions or external links.",
  props: mermaidDiagramSchema,
  component: ({ props }) => <MermaidDiagram title={props.title} diagram={props.diagram} embedded />,
});

const visualHtmlSchema = z.object({
  source: z.string().min(1).max(MAX_INTERACTIVE_VISUAL_LENGTH).refine(isInteractiveVisualSource),
}).strict();

const VisualHtmlComponent = defineComponent({
  name: "VisualHtml",
  description: "A bespoke interactive illustration. Pass a self-contained HTML fragment with inline style and script; no full document, network, external assets, links, forms, imports, fetch, or app APIs. The host renders it in a sandboxed frame.",
  props: visualHtmlSchema,
  component: ({ props }) => <InteractiveHtmlVisual source={props.source} />,
});

export const appOpenUILibrary = createLibrary({
  root: "Stack",
  components: [
    ...Object.values(openuiLibrary.components),
    WhiteboardComponent,
    MermaidComponent,
    VisualHtmlComponent,
  ],
});

const parser = createParser(appOpenUILibrary.toJSONSchema(), "Stack");
const knownComponents = new Set(Object.keys(appOpenUILibrary.components));
const MAX_PROGRAM_LENGTH = 256_000;
const MAX_COMPONENTS = 40;
const UNSAFE_URL = /(?:https?:\/\/|file:\/\/|javascript:|data:)/i;

type Element = { type: "element"; typeName: string; props: Record<string, unknown> };

function inspectTree(value: unknown, depth: number, state: { count: number; hasHtml: boolean }): boolean {
  if (depth > 12) return false;
  if (typeof value === "string") return !UNSAFE_URL.test(value);
  if (Array.isArray(value)) return value.every((item) => inspectTree(item, depth + 1, state));
  if (!value || typeof value !== "object") return true;
  const item = value as Record<string, unknown>;
  if (item.type === "element") {
    const element = item as Element;
    if (!knownComponents.has(element.typeName) || ++state.count > MAX_COMPONENTS) return false;
    if (element.typeName === "Whiteboard" && !whiteboardSchema.safeParse(element.props).success) return false;
    if (element.typeName === "Mermaid" && !mermaidDiagramSchema.safeParse(element.props).success) return false;
    if (element.typeName === "VisualHtml") {
      state.hasHtml = true;
      if (!visualHtmlSchema.safeParse(element.props).success) return false;
      return Object.entries(element.props).every(([key, child]) => key === "source" || inspectTree(child, depth + 1, state));
    }
  }
  return Object.values(item).every((child) => inspectTree(child, depth + 1, state));
}

export function inspectOpenUI(source: string): { valid: boolean; reason?: string; selfFramed?: boolean; hasHtml?: boolean } {
  if (!source.trim() || source.length > MAX_PROGRAM_LENGTH) return { valid: false, reason: "size" };
  try {
    const result = parser.parse(source);
    if (!result.root || result.root.typeName !== "Stack" || result.meta.incomplete ||
        result.meta.errors.length || result.meta.unresolved.length || result.meta.statementCount > MAX_COMPONENTS ||
        result.queryStatements.length || result.mutationStatements.length) {
      return { valid: false, reason: "parse" };
    }
    const state = { count: 0, hasHtml: false };
    if (!inspectTree(result.root, 0, state)) return { valid: false, reason: "content" };
    const children = result.root.props.children;
    const first = Array.isArray(children) ? children[0] as Element | undefined : undefined;
    const selfFramed = Array.isArray(children) && children.length === 1 && first?.type === "element" &&
      ["Whiteboard", "VisualHtml"].includes(first.typeName);
    return { valid: true, selfFramed, ...(state.hasHtml ? { hasHtml: true } : {}) };
  } catch {
    return { valid: false, reason: "parse" };
  }
}

function normalizeStandaloneVisualHtml(source: string): string {
  if (!source.trim() || source.length > MAX_PROGRAM_LENGTH) return source;
  try {
    const result = parser.parse(source);
    if (result.root?.typeName !== "VisualHtml" || result.meta.incomplete ||
        result.meta.errors.length || result.meta.unresolved.length || result.meta.statementCount !== 1 ||
        result.queryStatements.length || result.mutationStatements.length) return source;
    const props = visualHtmlSchema.safeParse(result.root.props);
    if (!props.success) return source;
    return `root = Stack([VisualHtml(${JSON.stringify(props.data.source)})])`;
  } catch {
    return source;
  }
}

// A bespoke scene is sometimes emitted inside VisualHtml("...") with bare
// quotes in SVG handlers. Recover only a final VisualHtml call in a Stack;
// the rebuilt program must still pass the ordinary parser and safety checks.
function recoverQuotedVisualHtml(source: string): string | null {
  const marker = 'VisualHtml("';
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0 ||
      !/^\s*root\s*=\s*Stack\(\s*\[/.test(source.slice(0, start))) return null;
  const ending = /"\s*\)\s*\]\s*\)\s*$/.exec(source);
  if (!ending || ending.index <= start + marker.length) return null;
  const raw = source.slice(start + marker.length, ending.index);
  let quoted = '"';
  let backslashes = 0;
  for (const char of raw) {
    if (char === '"' && backslashes % 2 === 0) quoted += '\\';
    quoted += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : char;
    backslashes = char === "\\" ? backslashes + 1 : 0;
  }
  quoted += '"';
  try {
    const html = JSON.parse(quoted) as unknown;
    if (!isInteractiveVisualSource(html)) return null;
    const tail = ending[0].replace(/^"\s*\)/, "");
    const repaired = `${source.slice(0, start)}VisualHtml(${JSON.stringify(html)})${tail}`;
    return inspectOpenUI(repaired).valid ? repaired : null;
  } catch {
    return null;
  }
}

class VisualRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[visual] OpenUI rendering failed:", error.message);
  }

  render() {
    return this.state.failed ? <VisualFenceStatus /> : this.props.children;
  }
}

function OpenUIVisualSurface({ source, selfFramed }: { source: string; selfFramed: boolean }) {
  return (
    <GeneratedVisualViewport>
      <VisualRenderBoundary key={source}>
        <div
          className={`app-openui-visual${selfFramed ? " app-openui-visual--bare" : ""}`}
          aria-label="Interactive visual"
          style={openUIThemeStyle}
        >
          <Renderer response={source} library={appOpenUILibrary} isStreaming={false} toolProvider={null} publishObservability={false} />
        </div>
      </VisualRenderBoundary>
    </GeneratedVisualViewport>
  );
}

function VisualFenceStatus({ pending = false }: { pending?: boolean }) {
  return (
    <div className="app-openui-status" role="status" aria-live={pending ? "polite" : "off"}>
      {pending ? "Preparing visual..." : "This visual couldn't be displayed. The rest of the answer is still available."}
    </div>
  );
}

type VisualFenceProps = { language: string; source: string; streaming: boolean; fenceClosed: boolean };
type ValidatedVisual = { source: string; selfFramed: boolean };

function validatedVisual({ language, source, streaming, fenceClosed }: VisualFenceProps): ValidatedVisual | null {
  let program = source;
  if (language === "openui") {
    // A complete OpenUI program is safe to show even before the closing Markdown fence arrives.
    program = normalizeStandaloneVisualHtml(source);
  } else if (language === "mermaid") {
    if ((streaming && !fenceClosed) || source.length > MAX_MERMAID_LENGTH ||
        !mermaidDiagramSchema.safeParse({ diagram: source }).success) return null;
    program = `root = Stack([Mermaid(${JSON.stringify(source)})])`;
  } else if (language === "visual-html") {
    if (!fenceClosed || !isInteractiveVisualSource(source)) return null;
    program = `root = Stack([VisualHtml(${JSON.stringify(source)})])`;
  } else {
    return null;
  }
  const inspected = inspectOpenUI(program);
  if (language === "openui" && !fenceClosed && inspected.hasHtml) return null;
  if (!inspected.valid && language === "openui" && fenceClosed) {
    const recovered = recoverQuotedVisualHtml(program);
    if (recovered) {
      const repaired = inspectOpenUI(recovered);
      return { source: recovered, selfFramed: Boolean(repaired.selfFramed) };
    }
  }
  if (!inspected.valid && !streaming && language === "openui") {
    console.warn("[visual] OpenUI source rejected:", inspected.reason);
  }
  return inspected.valid ? { source: program, selfFramed: Boolean(inspected.selfFramed) } : null;
}

type VisualFenceState = VisualFenceProps & { current: ValidatedVisual | null; lastValid: ValidatedVisual | null };

class ProgressiveVisualFence extends Component<VisualFenceProps, VisualFenceState> {
  constructor(props: VisualFenceProps) {
    super(props);
    const current = validatedVisual(props);
    this.state = { ...props, current, lastValid: current };
  }

  static getDerivedStateFromProps(props: VisualFenceProps, state: VisualFenceState): VisualFenceState | null {
    if (props.language === state.language && props.source === state.source &&
        props.streaming === state.streaming && props.fenceClosed === state.fenceClosed) return null;
    const current = validatedVisual(props);
    return {
      ...props,
      current,
      lastValid: current ?? (props.language === state.language ? state.lastValid : null),
    };
  }

  render() {
    if (this.props.language === "visual-html") {
      if (!this.props.streaming && this.props.fenceClosed && !this.state.current) return <VisualFenceStatus />;
      return <GeneratedVisualViewport>
        <InteractiveHtmlVisual
          source={this.state.current ? this.props.source : null}
          previewSource={this.props.streaming || !this.props.fenceClosed ? this.props.source : undefined}
          incomplete={!this.props.streaming && !this.props.fenceClosed}
        />
      </GeneratedVisualViewport>;
    }
    const visual = this.state.current ?? (this.props.streaming ? this.state.lastValid : null);
    if (visual) return <OpenUIVisualSurface source={visual.source} selfFramed={visual.selfFramed} />;
    return <VisualFenceStatus pending={this.props.streaming} />;
  }
}

export function visualFenceContent(language: string, source: string, streaming: boolean, fenceClosed = !streaming): ReactElement | null {
  if (language !== "openui" && language !== "mermaid" && language !== "visual-html") return null;
  return <ProgressiveVisualFence language={language} source={source} streaming={streaming} fenceClosed={fenceClosed} />;
}
