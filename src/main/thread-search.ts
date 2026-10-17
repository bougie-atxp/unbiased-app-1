export function matchingMessageSnippet(messages: readonly string[], query: string): string | null {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return null;

  for (const message of messages) {
    const index = message.toLocaleLowerCase().indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 56);
    const end = Math.min(message.length, index + needle.length + 88);
    const excerpt = message.slice(start, end).replace(/\s+/g, " ").trim();
    return `${start > 0 ? "… " : ""}${excerpt}${end < message.length ? " …" : ""}`;
  }
  return null;
}

export function messagesFromTranscriptEntries(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const messages: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { kind?: string; text?: unknown; entries?: unknown };
    if (item.kind === "work") messages.push(...messagesFromTranscriptEntries(item.entries));
    else if ((item.kind === "user" || item.kind === "assistant") && typeof item.text === "string") messages.push(item.text);
  }
  return messages;
}
