import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CloseIcon } from "./close-icon";

test("close icon keeps both strokes inside its viewBox", () => {
  const markup = renderToStaticMarkup(<CloseIcon />);
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /M18 6 6 18/);
  assert.match(markup, /m6 6 12 12/);
});

test("close icon allows a tighter custom viewBox", () => {
  const markup = renderToStaticMarkup(<CloseIcon viewBox="3 3 18 18" />);
  assert.match(markup, /viewBox="3 3 18 18"/);
});
