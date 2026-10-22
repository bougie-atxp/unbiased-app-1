const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
const { buildSync } = require("esbuild");
require("tsx/cjs");
const { interactiveVisualDocument } = require("../src/shared/interactive-visual.ts");

const sources = [
  '<div style="height:950px;background:#19333b">First visual</div>',
  '<div style="height:1100px;background:#273526">Second visual</div>',
];
const urls = Object.fromEntries(sources.map((source) => [source,
  `data:text/html;charset=utf-8,${encodeURIComponent(interactiveVisualDocument(source))}`]));

const bundle = buildSync({
  stdin: {
    resolveDir: require("node:path").resolve(__dirname, ".."),
    loader: "tsx",
    contents: `
      import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Virtuoso } from 'react-virtuoso';
      import { InteractiveHtmlVisual } from './src/renderer/src/interactive-html-visual.tsx';
      import { settleTranscriptBottom } from './src/renderer/src/transcript-scroll.ts';

      const sources = ${JSON.stringify(sources)};
      const rows = [
        ...Array.from({ length: 8 }, (_, index) => ({ text: 'Earlier message ' + index })),
        { source: sources[0] }, { text: 'Between the visuals' }, { source: sources[1] },
      ];
      function Transcript() {
        const [, setTick] = useState(0);
        const scroller = useRef(null);
        const following = useRef({ following: true, atBottom: true });
        const followFrame = useRef(null);
        const observer = useRef(null);
        useEffect(() => {
          const timer = setInterval(() => setTick((value) => value + 1), 100);
          return () => clearInterval(timer);
        }, []);
        const follow = useCallback(() => {
          if (!following.current.following || followFrame.current !== null) return;
          followFrame.current = requestAnimationFrame(() => {
            followFrame.current = null;
            settleTranscriptBottom(following.current, scroller.current);
          });
        }, []);
        const setScroller = useCallback((node) => { scroller.current = node; }, []);
        useLayoutEffect(() => {
          const list = scroller.current?.querySelector('[data-testid="virtuoso-item-list"]');
          if (!list || observer.current?.list === list) return;
          observer.current?.resize.disconnect();
          const resize = new ResizeObserver(follow);
          resize.observe(list);
          resize.observe(scroller.current);
          observer.current = { list, resize };
        });
        useEffect(() => () => {
          observer.current?.resize.disconnect();
          if (followFrame.current !== null) cancelAnimationFrame(followFrame.current);
        }, []);
        return <Virtuoso
          style={{ height: '100%', width: '100%' }}
          scrollerRef={setScroller}
          totalCount={rows.length}
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
          defaultItemHeight={120}
          increaseViewportBy={300}
          minOverscanItemCount={{ top: 6, bottom: 2 }}
          followOutput={false}
          totalListHeightChanged={follow}
          itemContent={(index) => <div style={{ margin: '12px auto', maxWidth: 700 }}>
            {rows[index].source
              ? <InteractiveHtmlVisual source={rows[index].source} />
              : <div style={{ height: 80 }}>{rows[index].text}</div>}
          </div>}
        />;
      }
      createRoot(document.getElementById('root')).render(<Transcript />);
    `,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
}).outputFiles[0].text;

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    show: false, width: 1000, height: 750,
    webPreferences: { sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent("<html><body style='margin:0;background:#111;color:white'><div id='root' style='height:100vh'></div></body></html>")}`);
    await win.webContents.executeJavaScript(`
      window.visualRegistrations = 0;
      window.unbiased = { registerVisual: async (source) => {
        window.visualRegistrations++;
        return ${JSON.stringify(urls)}[source] ?? null;
      } };
      undefined;
    `);
    await win.webContents.executeJavaScript(`${bundle}\nundefined;`);
    const snapshot = () => win.webContents.executeJavaScript(`(() => {
      const scroller = document.querySelector('[data-testid="virtuoso-scroller"]');
      return {
        registrations: window.visualRegistrations,
        ready: document.querySelectorAll('iframe[style*="visibility: visible"]').length,
        loading: document.querySelectorAll('[role="status"]').length,
        gap: scroller ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop : null,
      };
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const first = await snapshot();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const second = await snapshot();
    assert.ok(first.registrations >= 2 && first.ready >= 2, JSON.stringify(first));
    assert.equal(second.registrations, first.registrations, JSON.stringify({ first, second }));
    assert.equal(second.loading, 0, JSON.stringify(second));
    assert.ok(second.gap !== null && second.gap <= 2, JSON.stringify(second));
    console.log("Completed visual frames remain mounted and transcript stays at bottom during idle redraws.");
  } finally {
    win.destroy();
    app.quit();
  }
}

main().catch((error) => { console.error(error); app.exit(1); });
