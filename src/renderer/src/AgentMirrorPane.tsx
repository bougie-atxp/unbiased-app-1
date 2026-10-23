import { useEffect, useRef, useState } from "react";

const colors = { dim: "var(--dim)" };

/** Live mirror of the agent's Chrome: JPEG frames from main's CDP screencast,
 *  with clicks/scroll/typing forwarded back. object-fit:contain letterboxes
 *  the frame, so a click's pane coordinates must be mapped through the drawn
 *  rect to page coordinates or input lands in the wrong place. */
export function AgentMirrorPane({ active, threadId }: { active: boolean; threadId: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [frame, setFrame] = useState<{ src: string; width: number; height: number } | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [status, setStatus] = useState<{ connected: boolean; url?: string; reason?: string; error?: string }>({
    connected: false,
  });
  const lastMoveRef = useRef(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const offs = [
      window.unbiased.onAgentMirrorFrame((p) => setFrame(p)),
      window.unbiased.onAgentMirrorState((p) => setStatus(p)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Start when this tab is shown, stop when hidden — no point streaming JPEGs
  // into a pane nobody is looking at.
  useEffect(() => {
    if (!active) return;
    setFrame(null);
    setStatus({connected:false});
    let cancelled = false;
    const failed = (error: unknown) => {
      if (!cancelled) setStatus({ connected: false, reason: "connection-error", error: error instanceof Error ? error.message : String(error) });
    };
    const el = wrapRef.current;
    const w = el?.clientWidth ?? 800;
    const h = el?.clientHeight ?? 600;
    // devicePixelRatio: the pane is painted at w*dpr real pixels, so the
    // capture must match or the frame is upscaled and text goes soft.
    void window.unbiased.agentMirrorStart({ width: w, height: h, dpr: window.devicePixelRatio || 1, threadId })
      .then(result => {
        if (!cancelled && !result.ok) setStatus({ connected: false, reason: result.reason ?? "connection-error", error: result.error });
      }).catch(failed);
    // TRAILING debounce. The old version was leading-edge only: it sent the
    // first size it saw and dropped everything within 250ms after it. The pane
    // is still laying out at mount, so the size it sent was a half-height box
    // and the corrected one — arriving milliseconds later — was thrown away.
    // The page then rendered at the wrong aspect and letterboxed for good.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (!r || r.width < 1 || r.height < 1) return;
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              resizeTimer = null;
              void window.unbiased.agentMirrorResize({
                width: r.width,
                height: r.height,
                dpr: window.devicePixelRatio || 1,
              }).catch(failed);
            }, 150);
          })
        : null;
    if (el && ro) ro.observe(el);
    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      ro?.disconnect();
      void window.unbiased.agentMirrorStop().catch(() => undefined);
    };
    // threadId included: switching conversations has to re-point the mirror,
    // or the pane keeps streaming the tab of the chat you just left.
  }, [active, threadId, retry]);

  // Pane point -> page point, accounting for the letterbox contain-fit.
  const toPage = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const img = imgRef.current;
    const f = frameRef.current;
    if (!img || !f) return null;
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / f.width, box.height / f.height);
    const drawnW = f.width * scale;
    const drawnH = f.height * scale;
    const offX = box.left + (box.width - drawnW) / 2;
    const offY = box.top + (box.height - drawnH) / 2;
    const x = (clientX - offX) / scale;
    const y = (clientY - offY) / scale;
    if (x < 0 || y < 0 || x > f.width || y > f.height) return null; // clicked the letterbox
    return { x: Math.round(x), y: Math.round(y) };
  };

  const send = (ev: Record<string, unknown>) => void window.unbiased.agentMirrorInput(ev).catch(() => undefined);
  // Modifiers come from the event that carries them — a shared ref would go
  // stale, since a mouse event can be modified without any key event firing.
  const modsOf = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
    (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

  const onMouse = (type: "mousePressed" | "mouseReleased" | "mouseMoved") => (e: React.MouseEvent) => {
    // Native mousemove fires ~120x/s; each one is an IPC round trip and Chrome
    // only needs enough to drive hover. Presses and releases are never dropped.
    if (type === "mouseMoved") {
      const now = Date.now();
      if (now - lastMoveRef.current < 33) return;
      lastMoveRef.current = now;
    }
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    send({ kind: "mouse", type, x: p.x, y: p.y, button: type === "mouseMoved" ? "none" : button, clickCount: e.detail || 1, modifiers: modsOf(e) });
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    send({ kind: "wheel", x: p.x, y: p.y, deltaX: e.deltaX, deltaY: e.deltaY, modifiers: modsOf(e) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Focus lives on the wrapper; keep the app's own shortcuts out of the page.
    e.preventDefault();
    const mods = modsOf(e);
    // A single printable char with no ctrl/meta is text; everything else is a key.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      send({ kind: "text", text: e.key });
      return;
    }
    const keyCode = e.key === "Enter" ? 13 : e.key === "Backspace" ? 8 : e.key === "Tab" ? 9 : e.key === "Escape" ? 27 : e.key === "ArrowUp" ? 38 : e.key === "ArrowDown" ? 40 : e.key === "ArrowLeft" ? 37 : e.key === "ArrowRight" ? 39 : (e.keyCode || 0);
    send({ kind: "key", type: "rawKeyDown", key: e.key, code: e.code, keyCode, modifiers: mods });
    send({ kind: "key", type: "keyUp", key: e.key, code: e.code, keyCode, modifiers: mods });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--code-bg)" }}>
      <div style={{ padding: "6px 12px", fontSize: 12, color: colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
        {status.connected ? status.url || "Agent browser" : status.reason === "connection-error" ? "Unable to connect to the agent browser" : status.reason === "no-tab" ? "No browser tab for this conversation" : status.reason === "no-browser" ? "Waiting for the agent to open the browser" : "Connecting to the agent browser…"}
      </div>
      <div
        ref={wrapRef}
        tabIndex={0}
        onMouseDown={onMouse("mousePressed")}
        onMouseUp={onMouse("mouseReleased")}
        onMouseMove={onMouse("mouseMoved")}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", outline: "none", cursor: "default", overflow: "hidden" }}
      >
        {frame ? (
          // width/height 100% + contain: the frame's aspect now matches the
          // pane's, so "contain" fills it edge to edge with no bars.
          <img ref={imgRef} src={frame.src} draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }} alt="" />
        ) : (
          <span style={{ color: colors.dim, fontSize: 13, textAlign: "center", padding: 16 }}>
            {status.connected
              ? "Waiting for the first frame…"
              : status.reason === "no-tab"
                ? "This conversation has not used the browser yet."
                : status.reason === "connection-error"
                  ? <>Could not display the agent browser. {status.error}<br /><button onClick={() => setRetry(n => n + 1)}>Retry</button></>
                : "The agent browser is not open."}
          </span>
        )}
      </div>
    </div>
  );
}

