import { SIDE_CHAT_RETAIN_MS } from "../shared/side-chat-retention";

export type RecentSideChat = {
  paneId: string;
  threadId: string;
  parentThreadId: string;
  cwd: string;
  baselineTurns: number;
  title: string;
  closedAt: number;
};

export type SideChatRecord = Omit<RecentSideChat, "closedAt"> & { closedAt: number | null; lastActiveAt: number };

export function parseSideChatRecords(value: unknown, now = Date.now()): SideChatRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is SideChatRecord => {
    if (!row || typeof row !== "object") return false;
    const r = row as Partial<SideChatRecord>;
    return typeof r.paneId === "string" && /^side:[a-zA-Z0-9_-]{1,32}$/.test(r.paneId) &&
      typeof r.threadId === "string" && !!r.threadId &&
      typeof r.parentThreadId === "string" && !!r.parentThreadId &&
      typeof r.cwd === "string" && !!r.cwd &&
      typeof r.title === "string" && typeof r.lastActiveAt === "number" && Number.isFinite(r.lastActiveAt) &&
      (r.closedAt === null || (typeof r.closedAt === "number" && Number.isFinite(r.closedAt)));
  }).map((row) => ({ ...row, baselineTurns: Number.isSafeInteger(row.baselineTurns) && row.baselineTurns >= 0 ? row.baselineTurns : 0,
    closedAt: row.closedAt ?? Math.min(row.lastActiveAt, now) }));
}

export async function listVisibleThreads<T>(
  readPage: (cursor: string | null) => Promise<{ data: T[]; nextCursor?: string | null }>,
  visible: (thread: T) => boolean,
  limit = 100,
): Promise<T[]> {
  const threads: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  while (threads.length < limit) {
    const page = await readPage(cursor);
    for (const thread of page.data) {
      if (visible(thread)) threads.push(thread);
      if (threads.length === limit) break;
    }
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) break;
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return threads;
}

export class SideChatRecents {
  private records = new Map<string, SideChatRecord>();

  constructor(records: SideChatRecord[] = []) {
    for (const record of records) this.records.set(record.paneId, record);
  }

  register(record: Omit<RecentSideChat, "closedAt">, now = Date.now()): void {
    this.records.set(record.paneId, { ...record, closedAt: null, lastActiveAt: now });
  }

  setBaselineTurns(paneId: string, baselineTurns: number): void {
    const record = this.records.get(paneId);
    if (record) record.baselineTurns = baselineTurns;
  }

  close(paneId: string, now = Date.now()): boolean {
    const record = this.records.get(paneId);
    if (!record || record.closedAt !== null) return false;
    record.closedAt = now;
    record.lastActiveAt = now;
    return true;
  }

  reopen(paneId: string, parentThreadId: string, now = Date.now()): RecentSideChat | null {
    const record = this.records.get(paneId);
    if (!record || record.parentThreadId !== parentThreadId || record.closedAt === null ||
        now - record.closedAt >= SIDE_CHAT_RETAIN_MS) return null;
    const reopened = { ...record, closedAt: record.closedAt };
    record.closedAt = null;
    record.lastActiveAt = now;
    return reopened;
  }

  get(paneId: string): SideChatRecord | undefined {
    return this.records.get(paneId);
  }

  forThread(threadId: string): SideChatRecord | undefined {
    return [...this.records.values()].find((record) => record.threadId === threadId);
  }

  recordsForParent(parentThreadId: string): SideChatRecord[] {
    return [...this.records.values()].filter((record) => record.parentThreadId === parentThreadId);
  }

  all(): SideChatRecord[] {
    return [...this.records.values()];
  }

  touchOpen(now = Date.now()): boolean {
    let touched = false;
    for (const record of this.records.values()) {
      if (record.closedAt !== null) continue;
      record.lastActiveAt = now;
      touched = true;
    }
    return touched;
  }

  remove(paneId: string): void {
    this.records.delete(paneId);
  }

  expired(now = Date.now()): string[] {
    return [...this.records.values()]
      .filter((record) => record.closedAt !== null && now - record.closedAt >= SIDE_CHAT_RETAIN_MS)
      .map((record) => record.paneId);
  }

  recent(now = Date.now()): RecentSideChat[] {
    return [...this.records.values()]
      .filter((record): record is SideChatRecord & { closedAt: number } =>
        record.closedAt !== null && now - record.closedAt < SIDE_CHAT_RETAIN_MS)
      .sort((a, b) => b.closedAt - a.closedAt);
  }
}
