export type BrowserVisit = {
  url: string;
  title: string;
  visits: number;
  lastVisited: number;
};

const MAX_VISITS = 40;

export function browserHistoryUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const result = url.toString();
    return result.length <= 2048 ? result : null;
  } catch {
    return null;
  }
}

export function parseBrowserVisits(raw: string | null): BrowserVisit[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .filter((item): item is BrowserVisit => {
        if (!item || typeof item !== "object") return false;
        const visit = item as Partial<BrowserVisit>;
        return typeof visit.url === "string" && browserHistoryUrl(visit.url) === visit.url &&
          typeof visit.title === "string" && typeof visit.visits === "number" && Number.isInteger(visit.visits) && visit.visits > 0 &&
          typeof visit.lastVisited === "number" && Number.isFinite(visit.lastVisited) && visit.lastVisited > 0;
      })
      .sort((a, b) => b.lastVisited - a.lastVisited)
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, MAX_VISITS)
      .map((item) => ({ ...item, title: item.title.slice(0, 120), visits: Math.min(item.visits, 10000) }));
  } catch {
    return [];
  }
}

export function recordBrowserVisit(visits: BrowserVisit[], rawUrl: string, title: string, at: number): BrowserVisit[] {
  const url = browserHistoryUrl(rawUrl);
  if (!url || !Number.isFinite(at)) return visits;
  const previous = visits.find((item) => item.url === url);
  const next = {
    url,
    title: title.trim().slice(0, 120) || previous?.title || new URL(url).hostname,
    visits: Math.min((previous?.visits ?? 0) + 1, 10000),
    lastVisited: at,
  };
  return [next, ...visits.filter((item) => item.url !== url)]
    .sort((a, b) => b.lastVisited - a.lastVisited)
    .slice(0, MAX_VISITS);
}

export function updateBrowserVisitTitle(visits: BrowserVisit[], rawUrl: string, title: string): BrowserVisit[] {
  const url = browserHistoryUrl(rawUrl);
  const cleanTitle = title.trim().slice(0, 120);
  if (!url || !cleanTitle) return visits;
  const current = visits.find((item) => item.url === url);
  if (!current || current.title === cleanTitle) return visits;
  return visits.map((item) => item.url === url ? { ...item, title: cleanTitle } : item);
}

export function suggestedBrowserSites(visits: BrowserVisit[], limit = 4): { url: string; label: string; visits: number }[] {
  const sites = new Map<string, { url: string; label: string; visits: number; lastVisited: number }>();
  for (const visit of visits) {
    const origin = new URL(visit.url).origin;
    const current = sites.get(origin);
    sites.set(origin, {
      url: origin,
      label: new URL(origin).hostname.replace(/^www\./, ""),
      visits: (current?.visits ?? 0) + visit.visits,
      lastVisited: Math.max(current?.lastVisited ?? 0, visit.lastVisited),
    });
  }
  return [...sites.values()]
    .sort((a, b) => b.visits - a.visits || b.lastVisited - a.lastVisited)
    .slice(0, limit)
    .map(({ url, label, visits: count }) => ({ url, label, visits: count }));
}
