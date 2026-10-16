/** A completed answer has duration metadata even when it used no tools. */
export function completedWorkDuration(
  startedAt: number | null,
  finishedAt: number,
  hasAnswer: boolean,
  hasToolWork: boolean,
): number | null | undefined {
  if (!hasAnswer && !hasToolWork) return undefined;
  return startedAt === null ? null : Math.max(0, (finishedAt - startedAt) / 1000);
}
