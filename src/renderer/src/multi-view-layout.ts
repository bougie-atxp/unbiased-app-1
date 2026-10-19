export const MAX_MULTI_VIEW_CHATS = 6;

export function multiViewColumns(count: number, width: number): number {
  if (count <= 1) return 1;
  if (count === 3) return width >= 3 * 360 ? 3 : 1;
  const desired = count <= 4 ? 2 : 3;
  return Math.max(1, Math.min(desired, Math.floor(width / 360)));
}

export function multiViewColumnSpans(count: number, columns: number): number[] {
  if (count === 5 && columns === 3) return [2, 2, 2, 3, 3];
  if (count === 5 && columns === 2) return [1, 1, 1, 1, 2];
  return Array(count).fill(1);
}

export function addMultiViewChat(ids: string[], id: string): string[] {
  if (!id || ids.includes(id) || ids.length >= MAX_MULTI_VIEW_CHATS) return ids;
  return [...ids, id];
}
