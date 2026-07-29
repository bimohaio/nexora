import type { AnimationClock } from "./contracts.js";

export class SystemAnimationClock implements AnimationClock {
  readonly #read: () => number;
  #last = 0;

  public constructor(read: () => number = defaultMonotonicNow) {
    this.#read = read;
  }

  public now(): number {
    const next = this.#read();
    if (!Number.isFinite(next)) return this.#last;
    this.#last = Math.max(this.#last, next);
    return this.#last;
  }
}

function defaultMonotonicNow(): number {
  const host = globalThis as { readonly performance?: { now(): number } };
  return typeof host.performance?.now === "function" ? host.performance.now() : Date.now();
}

export class ManualAnimationClock implements AnimationClock {
  #time: number;

  public constructor(initialTimeMs = 0) {
    if (!Number.isFinite(initialTimeMs) || initialTimeMs < 0)
      throw new RangeError("Initial animation time must be finite and non-negative.");
    this.#time = initialTimeMs;
  }

  public now(): number {
    return this.#time;
  }

  public advanceBy(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0)
      throw new RangeError("Animation clock delta must be finite and non-negative.");
    this.#time += deltaMs;
    return this.#time;
  }

  public set(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < this.#time)
      throw new RangeError("Animation clock cannot move backwards.");
    this.#time = timeMs;
  }
}

export { ManualAnimationClock as TestAnimationClock };
