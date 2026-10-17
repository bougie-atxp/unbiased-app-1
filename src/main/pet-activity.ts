export type PetState = "idle" | "working" | "done" | "failed";

export function petTurnActivityKey(threadId: string, scheduledKey?: string): string | null {
  if (scheduledKey?.startsWith("tune:")) return null;
  return scheduledKey ? `scheduled:${scheduledKey}` : `turn:${threadId}`;
}

export class PetActivity {
  private active = new Map<string, { completed: number; inFlight: Set<string>; seen: Set<string> }>();
  private recent: "done" | "failed" | null = null;
  private recentActions = 0;
  private recentThreads = 0;

  start(key: string): PetState {
    if (this.active.has(key)) return this.state;
    if (!this.active.size) {
      this.recentActions = 0;
      this.recentThreads = 0;
    }
    this.active.set(key, { completed: 0, inFlight: new Set(), seen: new Set() });
    this.recent = null;
    return this.state;
  }

  actionStarted(key: string, id: string): boolean {
    const job = this.active.get(key);
    if (!job || job.seen.has(id) || job.inFlight.has(id)) return false;
    job.inFlight.add(id);
    return true;
  }

  actionFinished(key: string, id: string, succeeded: boolean): boolean {
    const job = this.active.get(key);
    if (!job || job.seen.has(id)) return false;
    job.inFlight.delete(id);
    job.seen.add(id);
    if (succeeded) job.completed++;
    return true;
  }

  finish(key: string, outcome: "completed" | "failed" | "interrupted"): PetState {
    const job = this.active.get(key);
    if (!job) return this.state;
    this.active.delete(key);
    this.recentActions += job.completed;
    if (outcome === "completed") this.recentThreads++;
    if (outcome === "failed") this.recent = "failed";
    else if (outcome === "completed" && this.recent !== "failed") this.recent = "done";
    return this.state;
  }

  clearRecent(): PetState {
    this.recent = null;
    if (!this.active.size) {
      this.recentActions = 0;
      this.recentThreads = 0;
    }
    return this.state;
  }

  reset(): PetState {
    this.active.clear();
    this.recent = null;
    this.recentActions = 0;
    this.recentThreads = 0;
    return this.state;
  }

  get state(): PetState {
    return this.active.size ? "working" : (this.recent ?? "idle");
  }

  get runningCount(): number {
    return this.active.size;
  }

  get completedActions(): number {
    return this.recentActions + [...this.active.values()].reduce((total, job) => total + job.completed, 0);
  }

  get completedThreads(): number {
    return this.recentThreads;
  }

  get inFlightActions(): number {
    return [...this.active.values()].reduce((total, job) => total + job.inFlight.size, 0);
  }
}
