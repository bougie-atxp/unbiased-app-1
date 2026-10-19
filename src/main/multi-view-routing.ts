export function multiViewRecipients(
  panes: Record<string, { threadId: string | null }>,
  source: string,
): string[] {
  const threadId = panes[source]?.threadId;
  if (!threadId) return [];
  return Object.entries(panes)
    .filter(([paneId, pane]) => paneId.startsWith("multi:") && paneId !== source && pane.threadId === threadId)
    .map(([paneId]) => paneId);
}
