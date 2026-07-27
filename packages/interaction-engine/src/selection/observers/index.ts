import type { SelectionEvent, SelectionEventType } from "../events/index.js";

export type SelectionObserver = (event: SelectionEvent) => void;

interface ObserverEntry {
  readonly id: number;
  readonly observer: SelectionObserver;
  readonly type?: SelectionEventType;
  readonly priority: number;
  readonly once: boolean;
}

export class SelectionObservers {
  readonly #entries = new Map<number, ObserverEntry>();
  #nextId = 0;
  public get size(): number {
    return this.#entries.size;
  }
  public subscribe(
    observer: SelectionObserver,
    options: { readonly type?: SelectionEventType; readonly priority?: number } = {}
  ): () => void {
    return this.#add(observer, options, false);
  }
  public once(
    observer: SelectionObserver,
    options: { readonly type?: SelectionEventType; readonly priority?: number } = {}
  ): () => void {
    return this.#add(observer, options, true);
  }
  public unsubscribe(observer: SelectionObserver): void {
    for (const [id, entry] of this.#entries)
      if (entry.observer === observer) this.#entries.delete(id);
  }
  public notify(event: SelectionEvent): void {
    const entries = [...this.#entries.values()]
      .filter((entry) => entry.type === undefined || entry.type === event.type)
      .sort((left, right) => right.priority - left.priority || left.id - right.id);
    for (const entry of entries) {
      if (!this.#entries.has(entry.id)) continue;
      entry.observer(event);
      if (entry.once) this.#entries.delete(entry.id);
    }
  }
  public dispose(): void {
    this.#entries.clear();
  }
  #add(
    observer: SelectionObserver,
    options: { readonly type?: SelectionEventType; readonly priority?: number },
    once: boolean
  ): () => void {
    const id = this.#nextId++;
    const entry: ObserverEntry = {
      id,
      observer,
      priority: options.priority ?? 0,
      once,
      ...(options.type === undefined ? {} : { type: options.type })
    };
    this.#entries.set(id, entry);
    return () => {
      this.#entries.delete(id);
    };
  }
}
