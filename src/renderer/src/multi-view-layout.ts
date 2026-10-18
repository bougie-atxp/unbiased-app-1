export const MAX_MULTI_VIEW_CHATS = 6;

export function multiViewColumns(count: number, width: number): number {
  if (count <= 1) return 1;
  const desired = count === 2 ? 2 : count <= 4 ? 2 : 3;
  return Math.max(1, Math.min(desired, Math.floor(width / 360)));
}

export function addMultiViewChat(ids: string[], id: string): string[] {
  if (!id || ids.includes(id) || ids.length >= MAX_MULTI_VIEW_CHATS) return ids;
  return [...ids, id];
}
