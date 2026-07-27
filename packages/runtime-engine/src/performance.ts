import type { RuntimeDataPointInput, RuntimeDispatchUpdate } from "./contracts.js";

export type RuntimeBatchMergeStrategy = "latest" | "earliest";

/**
 * Keyed input queue for frame-level batching. Insertion order is stable and duplicate keys do not
 * allocate additional queue records.
 */
export class RuntimeBatchQueue {
  readonly #inputs = new Map<string, Readonly<RuntimeDataPointInput>>();
  public constructor(private readonly strategy: RuntimeBatchMergeStrategy = "latest") {}
  public enqueue(input: Readonly<RuntimeDataPointInput>): void {
    if (this.strategy === "earliest" && this.#inputs.has(input.key)) return;
    this.#inputs.set(input.key, input);
  }
  public enqueueMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): void {
    for (const input of inputs) this.enqueue(input);
  }
  public flush(): readonly Readonly<RuntimeDataPointInput>[] {
    if (this.#inputs.size === 0) return Object.freeze([]);
    const batch = Object.freeze([...this.#inputs.values()]);
    this.#inputs.clear();
    return batch;
  }
  public get size(): number {
    return this.#inputs.size;
  }
  public clear(): void {
    this.#inputs.clear();
  }
}

/** Bounded pool for internal short-lived objects. Pooled objects must never enter snapshots. */
export class RuntimeObjectPool<T> {
  readonly #available: T[] = [];
  public constructor(
    private readonly create: () => T,
    private readonly reset: (value: T) => void,
    private readonly maximumSize = 256
  ) {}
  public acquire(): T {
    return this.#available.pop() ?? this.create();
  }
  public release(value: T): void {
    this.reset(value);
    if (this.#available.length < this.maximumSize) this.#available.push(value);
  }
  public get available(): number {
    return this.#available.length;
  }
  public clear(): void {
    this.#available.length = 0;
  }
}

export interface RuntimeMemorySnapshot {
  readonly activeSubscriptions: number;
  readonly cachedSnapshots: number;
  readonly cachedVisualStates: number;
  readonly queuedUpdates: number;
  readonly pooledObjects: number;
  readonly disposedResources: number;
}

export class RuntimeMemoryAudit {
  #previous: RuntimeMemorySnapshot | undefined;
  public capture(snapshot: RuntimeMemorySnapshot): RuntimeMemorySnapshot {
    this.#previous = Object.freeze({ ...snapshot });
    return this.#previous;
  }
  public get latest(): RuntimeMemorySnapshot | undefined {
    return this.#previous;
  }
  public hasPotentialLeak(current: RuntimeMemorySnapshot): boolean {
    const previous = this.#previous;
    if (previous === undefined) return false;
    return (
      current.activeSubscriptions > previous.activeSubscriptions ||
      current.queuedUpdates > previous.queuedUpdates ||
      current.cachedSnapshots > previous.cachedSnapshots + 1
    );
  }
}

export interface RuntimeSerializableBatch {
  readonly sequence: number;
  readonly updates: readonly RuntimeDispatchUpdate[];
}

/** DOM-free serialization boundary reserved for a future worker transport. */
export function createRuntimeSerializableBatch(
  sequence: number,
  updates: readonly RuntimeDispatchUpdate[]
): RuntimeSerializableBatch {
  return Object.freeze({ sequence, updates: Object.freeze([...updates]) });
}
