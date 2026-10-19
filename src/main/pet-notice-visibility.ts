export function shouldShowCompletedPetNotice(
  threadId: string,
  appFocused: boolean,
  visibleThreadIds: ReadonlySet<string>,
  visiblePaneIds: ReadonlySet<string>,
  panes: Readonly<Record<string, { threadId: string | null }>>,
): boolean {
  if (!appFocused) return true;
  if (visibleThreadIds.has(threadId)) return false;
  for (const paneId of visiblePaneIds) {
    if (panes[paneId]?.threadId === threadId) return false;
  }
  return true;
}
