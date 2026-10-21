import { hydrateTranscriptTimes } from "./conversation-time";

export type TranscriptRow<T> = { kind: string; text?: string; at?: number; entries?: T[]; name?: string };

export function repairCachedFolds<T extends TranscriptRow<T>>(cached: T[]): T[] {
  const fixed: T[] = [];
  let pendingSinceUser: T[] | null = null;
  for (const entry of cached) {
    if (entry.kind === "user") {
      if (pendingSinceUser) fixed.push(...pendingSinceUser);
      pendingSinceUser = [];
      fixed.push(entry);
    } else if (entry.kind === "assistant" && pendingSinceUser) {
      pendingSinceUser.push(entry);
    } else if (entry.kind === "work" && pendingSinceUser && pendingSinceUser.length > 0) {
      fixed.push({ ...entry, entries: [...pendingSinceUser, ...(entry.entries ?? [])] });
      pendingSinceUser = null;
    } else {
      if (pendingSinceUser) fixed.push(...pendingSinceUser);
      pendingSinceUser = null;
      fixed.push(entry);
    }
  }
  if (pendingSinceUser) fixed.push(...pendingSinceUser);
  return fixed;
}

function richness<T extends TranscriptRow<T>>(entries: T[]): number {
  return entries.reduce((total, entry) =>
    total + (entry.kind === "work" ? Math.max(entry.entries?.length ?? 0, 1) : 1), 0);
}

export function chooseTranscript<T extends TranscriptRow<T>>(history: T[], cached: T[] | null): T[] {
  if (!cached) return history;
  const repaired = repairCachedFolds(cached);
  return richness(repaired) > richness(history) ? hydrateTranscriptTimes(repaired, history) : history;
}

export function retitleTranscript<T extends TranscriptRow<T>>(entries: T[], names: Record<string, string>): T[] {
  if (Object.keys(names).length === 0) return entries;
  return entries.map((entry) => {
    if (entry.kind === "agent" && entry.name && names[entry.name]) return { ...entry, name: names[entry.name] };
    if (entry.kind === "work" && entry.entries) return { ...entry, entries: retitleTranscript(entry.entries, names) };
    return entry;
  });
}

export function transcriptPage<T>(entries: T[], before: number, limit: number): { entries: T[]; offset: number; total: number } {
  const end = Math.max(0, Math.min(Math.trunc(before), entries.length));
  const count = Math.max(1, Math.min(Math.trunc(limit), 200));
  const offset = Math.max(0, end - count);
  return { entries: entries.slice(offset, end), offset, total: entries.length };
}

export function initialTranscriptPage<T>(entries: T[], runningTurnStart: number | null): { entries: T[]; offset: number; total: number; runningTurnStart: number | null } {
  const recentStart = Math.max(0, entries.length - 80);
  const offset = runningTurnStart === null
    ? recentStart
    : Math.max(0, Math.min(recentStart, runningTurnStart));
  return {
    entries: entries.slice(offset),
    offset,
    total: entries.length,
    runningTurnStart: runningTurnStart === null ? null : Math.max(0, Math.min(entries.length - offset, runningTurnStart - offset)),
  };
}

export function alignRunningTurnStart<T extends TranscriptRow<T>>(history: T[], chosen: T[], runningTurnStart: number | null): number | null {
  if (runningTurnStart === null || chosen === history) return runningTurnStart;
  const runningUserCount = history.slice(runningTurnStart).filter((entry) => entry.kind === "user").length;
  if (runningUserCount === 0) return Math.max(0, chosen.length - (history.length - runningTurnStart));
  let remaining = runningUserCount;
  for (let index = chosen.length - 1; index >= 0; index--) {
    if (chosen[index].kind === "user" && --remaining === 0) return index;
  }
  return Math.max(0, chosen.length - (history.length - runningTurnStart));
}

export function shiftRunningTurnStart(runningTurnStart: number | null, prependedEntries: number): number | null {
  return runningTurnStart === null ? null : runningTurnStart + prependedEntries;
}

export function replaceTranscriptTail<T>(existing: T[], offset: number, tail: T[]): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > existing.length) return false;
  existing.length = offset;
  for (const entry of tail) existing.push(entry);
  return true;
}
