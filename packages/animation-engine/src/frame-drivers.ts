import type { AnimationFrameDriver } from "./scheduler-contracts.js";

interface AnimationFrameHost {
  requestAnimationFrame?(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame?(handle: unknown): void;
}

/**
 * Lazy browser RAF adapter. Construction is Node/SSR-safe; unsupported hosts fail on request
 * instead of silently creating an interval.
 */
export class BrowserAnimationFrameDriver implements AnimationFrameDriver {
  readonly #host: AnimationFrameHost;

  public constructor(host: AnimationFrameHost = globalThis as AnimationFrameHost) {
    this.#host = host;
  }

  public request(callback: (timestamp: number) => void): unknown {
    if (typeof this.#host.requestAnimationFrame !== "function")
      throw new Error("requestAnimationFrame is unavailable.");
    return this.#host.requestAnimationFrame(callback);
  }

  public cancel(handle: unknown): void {
    if (typeof this.#host.cancelAnimationFrame !== "function")
      throw new Error("cancelAnimationFrame is unavailable.");
    this.#host.cancelAnimationFrame(handle);
  }
}

/** Deterministic FIFO one-shot frame driver intended for tests and controlled simulations. */
export class ManualAnimationFrameDriver implements AnimationFrameDriver {
  readonly #callbacks = new Map<number, (timestamp: number) => void>();
  readonly #cancelledCallbacks: ((timestamp: number) => void)[] = [];
  #nextHandle = 1;
  #requestFailure: unknown;
  #cancelFailure: unknown;

  public get pendingCount(): number {
    return this.#callbacks.size;
  }

  public request(callback: (timestamp: number) => void): unknown {
    if (this.#requestFailure !== undefined) throw asError(this.#requestFailure);
    const handle = this.#nextHandle++;
    this.#callbacks.set(handle, callback);
    return handle;
  }

  public cancel(handle: unknown): void {
    if (this.#cancelFailure !== undefined) throw asError(this.#cancelFailure);
    if (typeof handle !== "number") return;
    const callback = this.#callbacks.get(handle);
    if (callback !== undefined) this.#cancelledCallbacks.push(callback);
    this.#callbacks.delete(handle);
  }

  /** Dispatches all callbacks pending at method entry. Nested requests remain for the next frame. */
  public fireFrame(timestamp: number): number {
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    for (const callback of callbacks) callback(timestamp);
    return callbacks.length;
  }

  public fireFrames(timestamps: readonly number[]): number {
    let dispatched = 0;
    for (const timestamp of timestamps) dispatched += this.fireFrame(timestamp);
    return dispatched;
  }

  /** Simulates a hostile host invoking a callback after successful cancellation. */
  public fireLastCancelled(timestamp: number): boolean {
    const callback = this.#cancelledCallbacks.pop();
    if (callback === undefined) return false;
    callback(timestamp);
    return true;
  }

  public failRequestsWith(cause: unknown): void {
    this.#requestFailure = cause;
  }

  public failCancellationsWith(cause: unknown): void {
    this.#cancelFailure = cause;
  }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
