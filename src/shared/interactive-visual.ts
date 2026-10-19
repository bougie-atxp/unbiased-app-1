export const INTERACTIVE_VISUAL_SCHEME = "unbiased-visual";
export const MAX_INTERACTIVE_VISUAL_LENGTH = 128_000;
export const INTERACTIVE_VISUAL_PREVIEW_URL = `${INTERACTIVE_VISUAL_SCHEME}://preview/`;

export function isInteractiveVisualPreviewUrl(url: string): boolean {
  return url === INTERACTIVE_VISUAL_PREVIEW_URL;
}

export function interactiveVisualId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const id = url.pathname.slice(1);
    return url.protocol === `${INTERACTIVE_VISUAL_SCHEME}:` && url.hostname === "view" &&
      /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname) &&
      !url.search && !url.hash ? id : null;
  } catch {
    return null;
  }
}

export const INTERACTIVE_VISUAL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function interactiveVisualPreviewCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export function interactiveVisualPreviewDocument(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root { color-scheme: dark; --visual-bg: #1f1f1f; --visual-fg: #f5f5f5; --visual-muted: #999; --visual-accent: #ff5546; }
* { box-sizing: border-box; } body { margin: 0; padding: 16px; min-width: 0; overflow-x: hidden; background: var(--visual-bg); color: var(--visual-fg); font: 14px/1.5 system-ui, sans-serif; }</style>
<style id="visual-preview-style"></style>
<script nonce="${nonce}">
(() => {
  const report = () => parent.postMessage({ type: 'unbiased-visual-preview-height', height: Math.ceil(document.body.scrollHeight) }, '*');
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'unbiased-visual-preview') return;
    const { html, css, colors, scheme } = event.data;
    if (typeof html !== 'string' || html.length > 128000 || typeof css !== 'string' || css.length > 32000) return;
    for (const [key, value] of Object.entries(colors ?? {})) {
      if (['bg', 'fg', 'muted', 'accent'].includes(key) && /^#[0-9a-f]{6}$/i.test(value))
        document.documentElement.style.setProperty('--visual-' + key, value);
    }
    if (scheme === 'light' || scheme === 'dark') document.documentElement.style.colorScheme = scheme;
    document.getElementById('visual-preview-style').textContent = css;
    document.body.innerHTML = html;
    report();
  });
  addEventListener('DOMContentLoaded', () => {
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(document.body);
    parent.postMessage({ type: 'unbiased-visual-preview-ready' }, '*');
  });
})();
</script></head><body></body></html>`;
}

export function isInteractiveVisualSource(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_INTERACTIVE_VISUAL_LENGTH &&
    /<[a-z][\s\S]*>/i.test(value) &&
    !/<\/?(?:html|head|body)\b|<!doctype\b/i.test(value);
}

export function interactiveVisualDocument(source: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; --visual-bg: #1f1f1f; --visual-fg: #f5f5f5; --visual-muted: #999; --visual-accent: #ff5546; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; min-width: 0; overflow-x: hidden; background: var(--visual-bg); color: var(--visual-fg); font: 14px/1.5 system-ui, sans-serif; }
  @media (max-width: 600px) { body { padding: 12px; } }
</style>
<script>
  (() => {
  const reportFailure = (kind, detail) => {
    parent.postMessage({ type: 'unbiased-visual-error', kind, detail: String(detail || '').slice(0, 300) }, '*');
  };
  addEventListener('error', event => reportFailure('runtime-error', event.message));
  addEventListener('unhandledrejection', event => reportFailure('unhandled-rejection', event.reason));
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'unbiased-visual-theme') return;
    for (const [key, value] of Object.entries(event.data.colors ?? {})) {
      if (['bg', 'fg', 'muted', 'accent'].includes(key) && /^#[0-9a-f]{6}$/i.test(value))
        document.documentElement.style.setProperty('--visual-' + key, value);
    }
    if (event.data.scheme === 'light' || event.data.scheme === 'dark')
      document.documentElement.style.colorScheme = event.data.scheme;
  });
  addEventListener('DOMContentLoaded', () => {
    const report = () => parent.postMessage({ type: 'unbiased-visual-height', height: Math.ceil(document.body.scrollHeight) }, '*');
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(report);
      observer.observe(document.body);
      observer.observe(document.documentElement);
    }
    report();
    parent.postMessage({ type: 'unbiased-visual-ready' }, '*');
  });
  })();
</script></head><body>${source}</body></html>`;
}
