export function isTranscriptAtBottom(scroll: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
}

export type TranscriptScrollState = { following: boolean; atBottom: boolean };

export function followTranscriptToLatest(
  state: TranscriptScrollState,
  list: { scrollToIndex: (location: { index: "LAST"; align: "end" }) => void } | null,
): void {
  if (state.following) list?.scrollToIndex({ index: "LAST", align: "end" });
}
export type TranscriptScrollAction =
  | { type: "follow" }
  | { type: "user-scroll-up" }
  | { type: "bottom-change"; atBottom: boolean };

export function transcriptScrollAfter(state: TranscriptScrollState, action: TranscriptScrollAction): TranscriptScrollState {
  if (action.type === "follow") return { ...state, following: true };
  if (action.type === "user-scroll-up") return { following: false, atBottom: false };
  return { ...state, atBottom: action.atBottom };
}

export function showScrollToLatest(state: TranscriptScrollState): boolean {
  return !state.following && !state.atBottom;
}
