export type RecentGroupLabel = "Today" | "Last 7 days" | "Last 30 days" | "Older";

type DatedThread = {
  createdAt?: string | number;
  updatedAt?: string | number | null;
};

function timestamp(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric)
    ? numeric < 100_000_000_000 ? numeric * 1000 : numeric
    : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function groupRecentThreads<T extends DatedThread>(threads: T[], now = new Date()): { label: RecentGroupLabel; threads: T[] }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const groups: Record<RecentGroupLabel, T[]> = {
    Today: [],
    "Last 7 days": [],
    "Last 30 days": [],
    Older: [],
  };
  for (const thread of threads) {
    const date = timestamp(thread.updatedAt) ?? timestamp(thread.createdAt);
    const label: RecentGroupLabel = date === null || date < month.getTime() ? "Older"
      : date < week.getTime() ? "Last 30 days"
      : date < today.getTime() ? "Last 7 days"
      : "Today";
    groups[label].push(thread);
  }
  return (Object.keys(groups) as RecentGroupLabel[])
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, threads: groups[label] }));
}
