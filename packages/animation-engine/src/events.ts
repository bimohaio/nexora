import { AnimationDisposedError, AnimationValidationError } from "./errors.js";

export type AnimationEventCategory =
  | "lifecycle"
  | "playback"
  | "timeline"
  | "composite"
  | "registry"
  | "factory"
  | "scheduler"
  | "diagnostic";
export type AnimationEventPriority = "critical" | "high" | "normal" | "low" | "background";

export interface AnimationEvent<T extends object = Readonly<Record<string, unknown>>> {
  readonly id: string;
  readonly timestamp: number;
  readonly animationId: string;
  readonly instanceId: string;
  readonly category: AnimationEventCategory;
  readonly version: 1;
  readonly correlationId: string;
  readonly priority: AnimationEventPriority;
  readonly payload: Readonly<T>;
}

export interface AnimationEventFilter {
  readonly ids?: readonly string[];
  readonly categories?: readonly AnimationEventCategory[];
  readonly instanceId?: string;
  readonly predicate?: (event: Readonly<AnimationEvent>) => boolean;
}

export interface AnimationEventSubscription {
  readonly id: number;
  unsubscribe(): void;
}

export interface AnimationEventDispatcherSnapshot {
  readonly subscriberCount: number;
  readonly queuedEventCount: number;
  readonly publishedEvents: number;
  readonly deliveredEvents: number;
  readonly subscriberFailures: number;
  readonly disposed: boolean;
}

interface Subscriber {
  readonly id: number;
  readonly sequence: number;
  readonly filter: Readonly<AnimationEventFilter>;
  readonly listener: (event: Readonly<AnimationEvent>) => void;
}

const PRIORITY: Readonly<Record<AnimationEventPriority, number>> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  background: 1
};

function immutablePayload<T extends object>(payload: Readonly<T>): Readonly<T> {
  return Object.freeze(
    Array.isArray(payload) ? [...payload] : { ...payload }
  ) as unknown as Readonly<T>;
}

/** Reentrancy-safe, instance-scoped event dispatcher with stable priority/creation ordering. */
export class AnimationEventDispatcher {
  readonly #subscribers = new Map<number, Subscriber>();
  readonly #queue: Readonly<AnimationEvent>[] = [];
  #sequence = 0;
  #published = 0;
  #delivered = 0;
  #failures = 0;
  #dispatching = false;
  #disposed = false;

  public subscribe(
    filter: Readonly<AnimationEventFilter>,
    listener: (event: Readonly<AnimationEvent>) => void
  ): AnimationEventSubscription {
    this.#assertUsable();
    if (typeof listener !== "function")
      throw new AnimationValidationError("Event listener must be a function.", {
        code: "INVALID_ANIMATION_CONFIGURATION"
      });
    const id = ++this.#sequence;
    const subscriber: Subscriber = {
      id,
      sequence: id,
      filter: Object.freeze({
        ...filter,
        ...(filter.ids === undefined ? {} : { ids: Object.freeze([...filter.ids]) }),
        ...(filter.categories === undefined
          ? {}
          : { categories: Object.freeze([...filter.categories]) })
      }),
      listener
    };
    this.#subscribers.set(id, subscriber);
    let active = true;
    return Object.freeze({
      id,
      unsubscribe: () => {
        if (!active) return;
        active = false;
        this.#subscribers.delete(id);
      }
    });
  }

  public publish<T extends object>(event: Readonly<AnimationEvent<T>>, queued = false): void {
    this.#assertUsable();
    this.#validateEvent(event);
    const immutable = Object.freeze({ ...event, payload: immutablePayload(event.payload) });
    this.#published += 1;
    if (queued || this.#dispatching) {
      this.#queue.push(immutable);
      return;
    }
    this.#deliver(immutable);
  }

  public flush(): number {
    this.#assertUsable();
    if (this.#dispatching) return 0;
    const queued = this.#queue.splice(0);
    queued.sort((left, right) => PRIORITY[right.priority] - PRIORITY[left.priority]);
    for (const event of queued) this.#deliver(event);
    return queued.length;
  }

  public snapshot(): AnimationEventDispatcherSnapshot {
    return Object.freeze({
      subscriberCount: this.#subscribers.size,
      queuedEventCount: this.#queue.length,
      publishedEvents: this.#published,
      deliveredEvents: this.#delivered,
      subscriberFailures: this.#failures,
      disposed: this.#disposed
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#subscribers.clear();
    this.#queue.length = 0;
  }

  #deliver(event: Readonly<AnimationEvent>): void {
    this.#dispatching = true;
    try {
      const subscribers = [...this.#subscribers.values()].sort(
        (left, right) => left.sequence - right.sequence
      );
      for (const subscriber of subscribers) {
        if (!this.#matches(subscriber.filter, event)) continue;
        try {
          subscriber.listener(event);
          this.#delivered += 1;
        } catch {
          this.#failures += 1;
        }
      }
    } finally {
      this.#dispatching = false;
    }
    if (this.#queue.length > 0) this.flush();
  }

  #matches(filter: Readonly<AnimationEventFilter>, event: Readonly<AnimationEvent>): boolean {
    if (filter.ids !== undefined && !filter.ids.includes(event.id)) return false;
    if (filter.categories !== undefined && !filter.categories.includes(event.category))
      return false;
    if (filter.instanceId !== undefined && filter.instanceId !== event.instanceId) return false;
    try {
      return filter.predicate?.(event) ?? true;
    } catch {
      this.#failures += 1;
      return false;
    }
  }

  #validateEvent(event: Readonly<AnimationEvent>): void {
    if (
      event.id.trim() === "" ||
      event.animationId.trim() === "" ||
      event.instanceId.trim() === "" ||
      event.correlationId.trim() === "" ||
      !Number.isFinite(event.timestamp)
    )
      throw new AnimationValidationError("Animation event is invalid.", {
        code: "INVALID_ANIMATION_CONFIGURATION"
      });
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new AnimationDisposedError("Animation event dispatcher is disposed.", {
        code: "ANIMATION_INSTANCE_DISPOSED"
      });
  }
}
