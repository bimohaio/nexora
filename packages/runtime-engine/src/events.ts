import type { RuntimeEventMap, RuntimeEventSubscription, RuntimeEventType } from "./contracts.js";

type RuntimeEventListener<K extends RuntimeEventType> = (event: RuntimeEventMap[K]) => void;

class EventSubscription implements RuntimeEventSubscription {
  #closed = false;

  public constructor(private readonly close: () => void) {}

  public get closed(): boolean {
    return this.#closed;
  }

  public unsubscribe(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.close();
  }

  public closeFromOwner(): void {
    this.#closed = true;
  }
}

/** Small synchronous, typed event bus. Listener failures are isolated. */
export class RuntimeEventBus {
  readonly #listeners = new Map<RuntimeEventType, Set<(event: never) => void>>();
  readonly #subscriptions = new Set<EventSubscription>();
  #disposed = false;

  public on<K extends RuntimeEventType>(
    type: K,
    listener: RuntimeEventListener<K>
  ): RuntimeEventSubscription {
    if (this.#disposed) throw new Error("Runtime event bus is disposed.");
    const listeners = this.#listeners.get(type) ?? new Set<(event: never) => void>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    const subscription = new EventSubscription(() => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(type);
      this.#subscriptions.delete(subscription);
    });
    this.#subscriptions.add(subscription);
    return subscription;
  }

  public emit<K extends RuntimeEventType>(type: K, event: RuntimeEventMap[K]): void {
    if (this.#disposed) return;
    for (const listener of [...(this.#listeners.get(type) ?? [])])
      try {
        listener(event as never);
      } catch {
        // Event observers cannot break the runtime loop.
      }
  }

  public clear(): void {
    for (const subscription of this.#subscriptions) subscription.closeFromOwner();
    this.#subscriptions.clear();
    this.#listeners.clear();
  }

  public dispose(): void {
    this.clear();
    this.#disposed = true;
  }
}
