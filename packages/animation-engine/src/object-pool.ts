import { AnimationLifecycleError, AnimationValidationError } from "./errors.js";

export interface ObjectPoolSnapshot {
  readonly available: number;
  readonly active: number;
  readonly created: number;
  readonly acquired: number;
  readonly released: number;
  readonly reused: number;
  readonly peakActive: number;
}

/**
 * Bounded ownership-tracking pool. Callers provide complete reset behavior; double release and
 * foreign-object release are rejected.
 */
export class ObjectPool<T extends object> {
  readonly #available: T[] = [];
  readonly #active = new Set<T>();
  readonly #owned = new Set<T>();
  #created = 0;
  #acquired = 0;
  #released = 0;
  #reused = 0;
  #peakActive = 0;

  public constructor(
    private readonly create: () => T,
    private readonly reset: (value: T) => void,
    private readonly capacity = 1_000
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new AnimationValidationError("Pool capacity must be a positive integer.", {
        code: "INVALID_CONFIGURATION"
      });
  }

  public acquire(): T {
    const value = this.#available.pop() ?? this.create();
    if (!this.#owned.has(value)) {
      this.#owned.add(value);
      this.#created += 1;
    } else {
      this.#reused += 1;
    }
    this.#active.add(value);
    this.#acquired += 1;
    this.#peakActive = Math.max(this.#peakActive, this.#active.size);
    return value;
  }

  public release(value: T): void {
    if (!this.#owned.has(value))
      throw new AnimationLifecycleError("Cannot release an object owned by another pool.", {
        code: "ANIMATION_POOL_OWNERSHIP_INVALID"
      });
    if (!this.#active.delete(value))
      throw new AnimationLifecycleError("Object was already released.", {
        code: "ANIMATION_POOL_DOUBLE_RELEASE"
      });
    this.reset(value);
    this.#released += 1;
    if (this.#available.length < this.capacity) this.#available.push(value);
    else this.#owned.delete(value);
  }

  public owns(value: T): boolean {
    return this.#owned.has(value);
  }

  public isActive(value: T): boolean {
    return this.#active.has(value);
  }

  public clear(): void {
    for (const value of this.#available) this.#owned.delete(value);
    this.#available.length = 0;
  }

  public snapshot(): ObjectPoolSnapshot {
    return Object.freeze({
      available: this.#available.length,
      active: this.#active.size,
      created: this.#created,
      acquired: this.#acquired,
      released: this.#released,
      reused: this.#reused,
      peakActive: this.#peakActive
    });
  }
}
