type Rect = { x: number; y: number; width: number; height: number };

export const PET_NOTICE_SIZE = { width: 336, height: 76 };
export const PET_NOTICE_DURATION_MS = 30_000;
export const PET_NOTICE_GAP = 8;

export function petNoticePosition(pet: Rect, area: Rect): { x: number; y: number } {
  const { width, height } = PET_NOTICE_SIZE;
  const x = Math.max(area.x, Math.min(area.x + area.width - width, pet.x + (pet.width - width) / 2));
  const above = pet.y - height - 8;
  const below = pet.y + pet.height + 8;
  const y = above >= area.y ? above : below + height <= area.y + area.height ? below : Math.max(area.y, above);
  return { x: Math.round(x), y: Math.round(y) };
}

export function petNoticeStackBounds(pet: Rect, area: Rect, count: number): Rect {
  const above = Math.max(0, pet.y - area.y - PET_NOTICE_GAP);
  const below = Math.max(0, area.y + area.height - pet.y - pet.height - PET_NOTICE_GAP);
  const placeAbove = above >= below;
  const available = placeAbove ? above : below;
  const desired = Math.max(1, count) * PET_NOTICE_SIZE.height + Math.max(0, count - 1) * PET_NOTICE_GAP;
  const height = Math.min(desired, Math.max(PET_NOTICE_SIZE.height, available), area.height);
  const x = Math.max(area.x, Math.min(area.x + area.width - PET_NOTICE_SIZE.width, pet.x + (pet.width - PET_NOTICE_SIZE.width) / 2));
  const y = placeAbove
    ? Math.max(area.y, pet.y - height - PET_NOTICE_GAP)
    : Math.min(area.y + area.height - height, pet.y + pet.height + PET_NOTICE_GAP);
  return { x: Math.round(x), y: Math.round(y), width: PET_NOTICE_SIZE.width, height: Math.round(height) };
}

export function petResponseFirstLine(text: string): string {
  const line = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const plain = line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim();
  return plain ? `${plain.slice(0, 180).trimEnd()}…` : "Response completed";
}

export function latestPetResponse(items: { type?: string; role?: string; phase?: string | null; text?: string; content?: unknown }[]): string {
  const answers = items.filter((item) => item.type === "agentMessage" || (item.type === "message" && item.role !== "user"));
  const final = [...answers].reverse().find((item) => item.phase === "final_answer") ?? answers.at(-1);
  if (typeof final?.text === "string") return final.text;
  if (!Array.isArray(final?.content)) return "";
  return final.content.map((part) => typeof part === "string" ? part : (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")).join("");
}
