export type PinnedThread = { id: string; title: string; inProject: boolean };

export function parsePinnedThreads(raw: string | null): PinnedThread[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((entry): entry is PinnedThread => {
      if (!entry || typeof entry.id !== "string" || typeof entry.title !== "string" || typeof entry.inProject !== "boolean" || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  } catch {
    return [];
  }
}

export function togglePinnedThread(current: PinnedThread[], target: PinnedThread): PinnedThread[] {
  return current.some((thread) => thread.id === target.id)
    ? current.filter((thread) => thread.id !== target.id)
    : [target, ...current];
}
