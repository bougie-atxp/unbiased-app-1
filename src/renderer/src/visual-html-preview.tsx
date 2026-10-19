import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { parseFragment } from "parse5";
import { INTERACTIVE_VISUAL_PREVIEW_URL, MAX_INTERACTIVE_VISUAL_LENGTH } from "../../shared/interactive-visual";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1600;
const PREVIEW_INTERVAL_MS = 150;

type PreviewNode = {
  nodeName: string;
  sourceCodeLocation?: { startOffset: number; endTag?: unknown };
  childNodes?: PreviewNode[];
  content?: { childNodes?: PreviewNode[] };
  value?: string;
};

type PreviewSnapshot = { html: string; css: string };
const EMPTY_PREVIEW: PreviewSnapshot = { html: "", css: "" };
const purifiers = new WeakMap<object, ReturnType<typeof DOMPurify>>();

export function sanitizeVisualPreview(source: string): PreviewSnapshot {
  if (!source || source.length > MAX_INTERACTIVE_VISUAL_LENGTH) return EMPTY_PREVIEW;
  const tree = parseFragment(source, { sourceCodeLocationInfo: true }) as PreviewNode;
  let incompleteStyleStart = source.length;
  const styles: string[] = [];
  const visit = (node: PreviewNode) => {
    if (node.nodeName === "style" && node.sourceCodeLocation) {
      if (!node.sourceCodeLocation.endTag) {
        incompleteStyleStart = Math.min(incompleteStyleStart, node.sourceCodeLocation.startOffset);
      } else {
        const css = (node.childNodes ?? []).map((child) => child.value ?? "").join("");
        if (!/@import\b|url\s*\(|expression\s*\(/i.test(css)) styles.push(css);
      }
    }
    for (const child of node.childNodes ?? node.content?.childNodes ?? []) visit(child);
  };
  visit(tree);
  const css = styles.join("\n").slice(0, 32_000);
  let purifier = purifiers.get(window);
  if (!purifier) {
    purifier = DOMPurify(window);
    purifiers.set(window, purifier);
  }
  const html = purifier.sanitize(source.slice(0, incompleteStyleStart), {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "textarea", "select", "button", "a", "link", "meta", "base", "video", "audio", "canvas"],
    FORBID_ATTR: ["href", "src", "srcset", "action", "formaction", "xlink:href", "target"],
    ALLOW_DATA_ATTR: false,
  });
  return { html, css };
}

function previewTheme(frame: HTMLIFrameElement) {
  let source: HTMLElement = frame;
  while (source.parentElement && !source.style.getPropertyValue("--bg")) source = source.parentElement;
  const style = getComputedStyle(source);
  const color = (name: string) => style.getPropertyValue(name).trim() || source.style.getPropertyValue(name).trim();
  const bg = color("--panel") || color("--bg");
  const channels = /^#([0-9a-f]{6})$/i.exec(bg)?.[1];
  const values = channels ? [0, 2, 4].map((offset) => {
    const value = parseInt(channels.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) : [];
  const light = values.length === 3 && values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.179;
  return {
    colors: { bg, fg: color("--fg-msg"), muted: color("--dim"), accent: color("--accent") },
    scheme: light ? "light" : "dark",
  };
}

export function VisualHtmlPreview({ source, incomplete }: { source: string; incomplete: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const latestSourceRef = useRef(source);
  const updateTimerRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot>(EMPTY_PREVIEW);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    latestSourceRef.current = source;
    if (updateTimerRef.current !== null) return;
    updateTimerRef.current = window.setTimeout(() => {
      updateTimerRef.current = null;
      setSnapshot(sanitizeVisualPreview(latestSourceRef.current));
    }, PREVIEW_INTERVAL_MS);
  }, [source]);

  useEffect(() => () => {
    if (updateTimerRef.current !== null) window.clearTimeout(updateTimerRef.current);
    updateTimerRef.current = null;
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null") return;
      if (event.data?.type === "unbiased-visual-preview-ready") setReady(true);
      if (event.data?.type === "unbiased-visual-preview-height" && Number.isFinite(event.data.height)) {
        setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(event.data.height))));
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (!ready || !frameRef.current) return;
    const frame = frameRef.current;
    const send = () => frame.contentWindow?.postMessage({ type: "unbiased-visual-preview", ...snapshot, ...previewTheme(frame) }, "*");
    send();
    let themeSource: HTMLElement = frame;
    while (themeSource.parentElement && !themeSource.style.getPropertyValue("--bg")) themeSource = themeSource.parentElement;
    const observer = new MutationObserver(send);
    observer.observe(themeSource, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [ready, snapshot]);

  return <>
    <iframe
      ref={frameRef}
      title="Visual preview"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      tabIndex={-1}
      aria-hidden="true"
      src={INTERACTIVE_VISUAL_PREVIEW_URL}
      onLoad={() => setReady(true)}
      style={{ display: ready && snapshot.html ? "block" : "none", width: "100%", height, border: 0, background: "var(--panel)", pointerEvents: "none" }}
    />
    {(!ready || !snapshot.html) && <div role="status" style={{ minHeight: 96, padding: 24, color: "var(--dim)", fontFamily: "var(--font-ui)", fontSize: 14 }}>Preparing visual...</div>}
    {incomplete && <div role="status" style={{ padding: "0 24px 12px", color: "var(--dim)", fontSize: 12 }}>Visual incomplete</div>}
  </>;
}
