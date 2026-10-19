const MAX_UNREAD_THREADS = 100;

export function parseUnreadCompletedThreads(raw: string | null): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 128).slice(-MAX_UNREAD_THREADS));
  } catch {
    return new Set();
  }
}

export function setThreadUnread(current: ReadonlySet<string>, id: string, unread: boolean): ReadonlySet<string> {
  if (current.has(id) === unread) return current;
  const next = new Set(current);
  if (unread) {
    next.add(id);
    if (next.size > MAX_UNREAD_THREADS) next.delete(next.values().next().value!);
  } else {
    next.delete(id);
  }
  return next;
}

export function unreadAfterThreadActivity(
  current: ReadonlySet<string>,
  activity: { threadId: string; running: boolean; completed?: boolean },
  visibleThreadIds: ReadonlySet<string>,
  focused: boolean,
): ReadonlySet<string> {
  if (activity.running || !activity.completed) return current;
  return setThreadUnread(current, activity.threadId, !visibleThreadIds.has(activity.threadId) || !focused);
}
