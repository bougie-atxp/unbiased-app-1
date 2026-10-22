export const SIDE_CHAT_RETAIN_MS = 2 * 60 * 60 * 1000;

export function sideChatRecoveryDuration(closedAt: number, now = Date.now()): string {
  const minutes = Math.ceil(Math.min(SIDE_CHAT_RETAIN_MS, Math.max(0, closedAt + SIDE_CHAT_RETAIN_MS - now)) / 60_000);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}h ${String(minutes % 60).padStart(2, "0")}m`;
}
