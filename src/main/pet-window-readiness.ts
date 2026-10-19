export const PET_RENDER_TIMEOUT_MS = 8000;

type Clock = {
  set: (callback: () => void, delay: number) => unknown;
  clear: (timer: unknown) => void;
};

const systemClock: Clock = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export function petRetryDelay(failures: number): number {
  return Math.min(500 * 2 ** Math.max(0, failures - 1), 10000);
}

export class PetWindowReadiness {
  private wanted = false;
  private ready = false;
  private disposed = false;
  private failures = 0;
  private generation = 0;
  private waitTimer: unknown = null;
  private retryTimer: unknown = null;

  constructor(
    private readonly callbacks: { load: () => Promise<void>; show: () => void; hide: () => void },
    private readonly clock: Clock = systemClock,
  ) {}

  get isReady(): boolean { return this.ready; }

  show(): void {
    if (this.disposed) return;
    this.wanted = true;
    if (this.ready) {
      this.callbacks.show();
    } else if (this.waitTimer === null && this.retryTimer === null) {
      this.load();
    }
  }

  hide(): void {
    this.wanted = false;
    this.generation++;
    this.clearTimers();
    this.callbacks.hide();
  }

  rendered(): void {
    if (this.disposed) return;
    this.ready = true;
    this.failures = 0;
    this.generation++;
    this.clearTimers();
    if (this.wanted) this.callbacks.show();
  }

  failed(): void {
    if (this.disposed) return;
    this.ready = false;
    this.callbacks.hide();
    if (this.retryTimer !== null) return;
    this.generation++;
    this.clearTimers();
    if (!this.wanted) return;
    this.retryTimer = this.clock.set(() => {
      this.retryTimer = null;
      this.load();
    }, petRetryDelay(++this.failures));
  }

  dispose(): void {
    this.disposed = true;
    this.wanted = false;
    this.generation++;
    this.clearTimers();
  }

  private load(): void {
    if (!this.wanted || this.disposed) return;
    const generation = ++this.generation;
    this.waitTimer = this.clock.set(() => this.failed(), PET_RENDER_TIMEOUT_MS);
    try {
      void this.callbacks.load().catch(() => {
        if (this.generation === generation) this.failed();
      });
    } catch {
      if (this.generation === generation) this.failed();
    }
  }

  private clearTimers(): void {
    if (this.waitTimer !== null) this.clock.clear(this.waitTimer);
    if (this.retryTimer !== null) this.clock.clear(this.retryTimer);
    this.waitTimer = null;
    this.retryTimer = null;
  }
}
