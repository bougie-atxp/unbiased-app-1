import assert from "node:assert/strict";
import test from "node:test";
import { browserHistoryUrl, parseBrowserVisits, recordBrowserVisit, suggestedBrowserSites, updateBrowserVisitTitle } from "./browser-start";

test("browser history retains only web URLs without credentials, queries, or fragments", () => {
  assert.equal(browserHistoryUrl("https://user:secret@example.com/path?token=abc#section"), "https://example.com/path");
  assert.equal(browserHistoryUrl("file:///tmp/private.txt"), null);
  assert.equal(browserHistoryUrl("about:blank"), null);
  assert.equal(browserHistoryUrl("not a URL"), null);
});

test("visits count navigations while title updates do not", () => {
  const first = recordBrowserVisit([], "https://example.com/a?token=1", "", 100);
  assert.deepEqual(first, [{ url: "https://example.com/a", title: "example.com", visits: 1, lastVisited: 100 }]);
  const titled = updateBrowserVisitTitle(first, "https://example.com/a?token=2", "Example A");
  assert.equal(titled[0].visits, 1);
  assert.equal(titled[0].title, "Example A");
  const second = recordBrowserVisit(titled, "https://example.com/a", "Example A", 200);
  assert.equal(second[0].visits, 2);
});

test("suggestions rank sites by visit frequency and recents survive malformed storage", () => {
  let visits = recordBrowserVisit([], "https://first.test/one", "One", 100);
  visits = recordBrowserVisit(visits, "https://second.test/", "Two", 200);
  visits = recordBrowserVisit(visits, "https://first.test/two", "Another", 300);
  assert.deepEqual(suggestedBrowserSites(visits).map((site) => site.label), ["first.test", "second.test"]);
  assert.deepEqual(parseBrowserVisits(JSON.stringify(visits)), visits);
  assert.deepEqual(parseBrowserVisits("invalid"), []);
});
