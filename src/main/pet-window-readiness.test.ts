import assert from "node:assert/strict";
import test from "node:test";
import { PET_RENDER_TIMEOUT_MS, PetWindowReadiness, petRetryDelay } from "./pet-window-readiness";

class FakeClock {
  private now = 0;
  private nextId = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();

  set = (callback: () => void, delay: number): number => {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.now + delay, callback });
    return id;
  };

  clear = (timer: unknown): void => { this.timers.delete(timer as number); };

  advance(ms: number): void {
    const end = this.now + ms;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.now = end;
  }
}

test("Pal stays hidden until painted and can be shown again without reloading", () => {
  const clock = new FakeClock();
  let loads = 0;
  let shows = 0;
  let hides = 0;
  const readiness = new PetWindowReadiness({
    load: async () => { loads++; },
    show: () => { shows++; },
    hide: () => { hides++; },
  }, clock);
  readiness.show();
  assert.equal(loads, 1);
  assert.equal(shows, 0);
  readiness.rendered();
  assert.equal(shows, 1);
  clock.advance(PET_RENDER_TIMEOUT_MS * 2);
  assert.equal(loads, 1);
  readiness.hide();
  readiness.show();
  assert.equal(loads, 1);
  assert.equal(shows, 2);
  assert.equal(hides, 1);
});

test("an unpainted Pal retries after the watchdog with bounded backoff", () => {
  const clock = new FakeClock();
  let loads = 0;
  let shows = 0;
  let hides = 0;
  const readiness = new PetWindowReadiness({
    load: async () => { loads++; },
    show: () => { shows++; },
    hide: () => { hides++; },
  }, clock);
  readiness.show();
  clock.advance(PET_RENDER_TIMEOUT_MS);
  assert.equal(hides, 1);
  clock.advance(499);
  assert.equal(loads, 1);
  clock.advance(1);
  assert.equal(loads, 2);
  readiness.rendered();
  assert.equal(shows, 1);
  assert.equal(petRetryDelay(1), 500);
  assert.equal(petRetryDelay(9), 10000);
});

test("hiding cancels retries and a later show tries again", () => {
  const clock = new FakeClock();
  let loads = 0;
  const readiness = new PetWindowReadiness({
    load: async () => { loads++; },
    show: () => {},
    hide: () => {},
  }, clock);
  readiness.show();
  readiness.failed();
  readiness.hide();
  clock.advance(PET_RENDER_TIMEOUT_MS * 2);
  assert.equal(loads, 1);
  readiness.show();
  assert.equal(loads, 2);
  readiness.dispose();
  clock.advance(PET_RENDER_TIMEOUT_MS * 2);
  assert.equal(loads, 2);
});

test("a renderer crash after painting hides the Pal and reloads it", () => {
  const clock = new FakeClock();
  let loads = 0;
  let hides = 0;
  const readiness = new PetWindowReadiness({
    load: async () => { loads++; },
    show: () => {},
    hide: () => { hides++; },
  }, clock);
  readiness.show();
  readiness.rendered();
  readiness.failed();
  assert.equal(readiness.isReady, false);
  assert.equal(hides, 1);
  clock.advance(500);
  assert.equal(loads, 2);
});

test("a rejected page load schedules one retry", async () => {
  const clock = new FakeClock();
  let loads = 0;
  const readiness = new PetWindowReadiness({
    load: () => ++loads === 1 ? Promise.reject(new Error("load failed")) : Promise.resolve(),
    show: () => {},
    hide: () => {},
  }, clock);
  readiness.show();
  await Promise.resolve();
  clock.advance(499);
  assert.equal(loads, 1);
  clock.advance(1);
  assert.equal(loads, 2);
  readiness.dispose();
});

test("a late load rejection cannot hide an already painted Pal", async () => {
  const clock = new FakeClock();
  let rejectLoad!: (error: Error) => void;
  let loads = 0;
  let hides = 0;
  const readiness = new PetWindowReadiness({
    load: () => { loads++; return new Promise<void>((_resolve, reject) => { rejectLoad = reject; }); },
    show: () => {},
    hide: () => { hides++; },
  }, clock);
  readiness.show();
  readiness.rendered();
  rejectLoad(new Error("late failure"));
  await Promise.resolve();
  clock.advance(500);
  assert.equal(readiness.isReady, true);
  assert.equal(loads, 1);
  assert.equal(hides, 0);
  readiness.dispose();
});
