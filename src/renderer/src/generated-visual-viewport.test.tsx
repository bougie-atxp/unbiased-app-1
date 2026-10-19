import assert from "node:assert/strict";
import test from "node:test";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { GeneratedVisualViewport } from "./generated-visual-viewport";

test("expands the existing visual, adjusts zoom, and restores transcript position", async () => {
  const dom = new JSDOM("<!doctype html><div data-transcript-scroll><div id='root'></div></div>", {
    url: "http://localhost", pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const document = dom.window.document;
  const transcript = document.querySelector<HTMLElement>("[data-transcript-scroll]")!;
  transcript.scrollTop = 314;
  const toggle = (element: HTMLElement, newState: "open" | "closed") => {
    const event = new dom.window.Event("toggle") as Event & { newState: string };
    event.newState = newState;
    element.dispatchEvent(event);
  };
  dom.window.HTMLElement.prototype.showPopover = function () {
    transcript.scrollTop = 90;
    toggle(this, "open");
  };
  dom.window.HTMLElement.prototype.hidePopover = function () {
    transcript.scrollTop = 140;
    toggle(this, "closed");
  };

  function Counter() {
    const [count, setCount] = useState(0);
    return <button type="button" onClick={() => setCount((value) => value + 1)}>Count {count}</button>;
  }

  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<GeneratedVisualViewport><Counter /></GeneratedVisualViewport>));
    const visual = document.querySelector<HTMLElement>(".app-generated-visual-viewport")!;
    const counter = visual.querySelector(":scope > button:last-child")!;
    const expand = document.querySelector<HTMLButtonElement>('button[aria-label="Expand visual"]')!;
    await act(async () => expand.click());
    assert.equal(visual.getAttribute("popover"), "auto");
    assert.equal(expand.getAttribute("aria-label"), "Close expanded visual");
    assert.equal(document.querySelector('output[aria-label="Zoom level"]')?.textContent, "100%");
    assert.equal(visual.style.getPropertyValue("--visual-zoom"), "1");
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click());
    assert.equal(visual.style.getPropertyValue("--visual-zoom"), "1.15");
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')!.click());
    assert.equal(visual.style.getPropertyValue("--visual-zoom"), "1");
    await act(async () => (counter as HTMLButtonElement).click());
    assert.equal(visual.querySelector(":scope > button:last-child"), counter);
    assert.match(counter.textContent ?? "", /Count 1/);

    await act(async () => visual.hidePopover());
    assert.equal(visual.hasAttribute("popover"), false);
    assert.equal(expand.getAttribute("aria-label"), "Expand visual");
    assert.equal(document.activeElement, expand);
    assert.equal(transcript.scrollTop, 314);
    await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    assert.equal(transcript.scrollTop, 314);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
