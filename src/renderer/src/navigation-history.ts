export type NavigationLocation =
  | { kind: "home" }
  | { kind: "project"; path: string; name: string }
  | { kind: "thread"; id: string }
  | { kind: "connectors" }
  | { kind: "scheduled" }
  | { kind: "multi" };

export type NavigationHistory = {
  entries: NavigationLocation[];
  index: number;
};

export const initialNavigationHistory: NavigationHistory = {
  entries: [{ kind: "home" }],
  index: 0,
};

function sameLocation(a: NavigationLocation, b: NavigationLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "project" && b.kind === "project") return a.path === b.path;
  if (a.kind === "thread" && b.kind === "thread") return a.id === b.id;
  return true;
}

export function pushNavigation(history: NavigationHistory, location: NavigationLocation): NavigationHistory {
  if (sameLocation(history.entries[history.index], location)) return history;
  return {
    entries: [...history.entries.slice(0, history.index + 1), location],
    index: history.index + 1,
  };
}

export function replaceNavigation(history: NavigationHistory, location: NavigationLocation): NavigationHistory {
  if (sameLocation(history.entries[history.index], location)) return history;
  const entries = [...history.entries];
  entries[history.index] = location;
  return { entries, index: history.index };
}

export function navigationTarget(history: NavigationHistory, delta: -1 | 1): NavigationLocation | null {
  return history.entries[history.index + delta] ?? null;
}
