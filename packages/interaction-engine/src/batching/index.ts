export interface BatchEntry<T> {
  readonly kind: string;
  readonly key: string;
  readonly value: T;
  readonly priority?: number;
}

export type BatchReducer<T> = (previous: Readonly<T>, next: Readonly<T>) => T;

export class InteractionBatch<T> {
  readonly #entries = new Map<string, BatchEntry<T>>();
  readonly #reducers = new Map<string, BatchReducer<T>>();
  #sequence = 0;
  readonly #order = new Map<string, number>();
  public registerReducer(kind: string, reducer: BatchReducer<T>): () => void {
    this.#reducers.set(kind, reducer);
    return () => this.#reducers.delete(kind);
  }
  public add(entry: BatchEntry<T>): void {
    const identity = `${entry.kind}:${entry.key}`;
    const previous = this.#entries.get(identity);
    const reducer = this.#reducers.get(entry.kind);
    const value =
      previous === undefined || reducer === undefined
        ? entry.value
        : reducer(previous.value, entry.value);
    if (!this.#order.has(identity)) this.#order.set(identity, this.#sequence++);
    this.#entries.set(identity, Object.freeze({ ...entry, value }));
  }
  public cancel(kind: string, key: string): boolean {
    const identity = `${kind}:${key}`;
    this.#order.delete(identity);
    return this.#entries.delete(identity);
  }
  public flush(): readonly BatchEntry<T>[] {
    const result = [...this.#entries.entries()]
      .sort(
        ([leftKey, left], [rightKey, right]) =>
          (right.priority ?? 0) - (left.priority ?? 0) ||
          (this.#order.get(leftKey) ?? 0) - (this.#order.get(rightKey) ?? 0)
      )
      .map(([, entry]) => entry);
    this.clear();
    return Object.freeze(result);
  }
  public clear(): void {
    this.#entries.clear();
    this.#order.clear();
  }
  public get size(): number {
    return this.#entries.size;
  }
}

export interface CoalescibleInteractionUpdate {
  readonly type:
    | "pointer-move"
    | "selection-update"
    | "hover-update"
    | "focus-update"
    | "drag-update"
    | "accessibility-update"
    | (string & {});
  readonly targetId: string;
}

export function interactionUpdateKey(update: CoalescibleInteractionUpdate): string {
  return `${update.type}:${update.targetId}`;
}
