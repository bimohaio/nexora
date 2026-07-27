import type { InteractionScheduler } from "../types/index.js";

export interface InteractionEventQueueOptions<T> {
  readonly coalesceKey?: (item: Readonly<T>) => string | undefined;
  readonly priority?: (item: Readonly<T>) => number;
}

export class InteractionEventQueue<T> {
  readonly #items: T[] = [];
  readonly #coalescedIndexes = new Map<string, number>();
  #scheduled: { cancel(): void } | undefined;
  #disposed = false;
  public constructor(
    private readonly consume: (items: readonly T[]) => void,
    private readonly scheduler?: InteractionScheduler,
    private readonly options: InteractionEventQueueOptions<T> = {}
  ) {}
  public get size(): number {
    return this.#items.length;
  }
  public enqueue(item: T): void {
    this.#assertUsable();
    const key = this.options.coalesceKey?.(item);
    const previousIndex = key === undefined ? undefined : this.#coalescedIndexes.get(key);
    if (previousIndex === undefined) {
      if (key !== undefined) this.#coalescedIndexes.set(key, this.#items.length);
      this.#items.push(item);
    } else this.#items[previousIndex] = item;
    if (this.scheduler !== undefined && this.#scheduled === undefined)
      this.#scheduled = this.scheduler.schedule(() => {
        this.#scheduled = undefined;
        this.flush();
      });
  }
  public batch(items: readonly T[]): void {
    for (const item of items) this.enqueue(item);
  }
  public flush(): void {
    this.#assertUsable();
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    if (this.#items.length === 0) return;
    const batch = this.#items.splice(0);
    this.#coalescedIndexes.clear();
    if (this.options.priority !== undefined)
      batch.sort(
        (left, right) =>
          (this.options.priority?.(right) ?? 0) - (this.options.priority?.(left) ?? 0)
      );
    this.consume(Object.freeze(batch));
  }
  public cancel(): void {
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    this.#items.length = 0;
    this.#coalescedIndexes.clear();
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.cancel();
    this.#disposed = true;
  }
  #assertUsable(): void {
    if (this.#disposed) throw new Error("Interaction queue is disposed.");
  }
}
export * from "./drag-utils.js";
export * from "./keyboard-utils.js";
