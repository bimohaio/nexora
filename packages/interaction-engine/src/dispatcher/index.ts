import type { InteractionEventType, PropagationPhase } from "../events/index.js";
import type { InteractionEvent } from "../events/index.js";
import type { InteractionSessionManager } from "../sessions/index.js";
import type { InteractionTarget } from "../types/index.js";

export interface InteractionListenerOptions {
  readonly type?: InteractionEventType;
  readonly phase?: PropagationPhase | "any";
  readonly priority?: number;
  readonly filter?: (event: InteractionEvent) => boolean;
}
export type InteractionListener = (event: InteractionEvent) => void;
interface Entry {
  readonly id: number;
  readonly listener: InteractionListener;
  readonly options: InteractionListenerOptions;
  readonly once: boolean;
}

export class InteractionDispatcher {
  readonly #listeners = new Map<number, Entry>();
  #nextId = 0;
  #disposed = false;
  public constructor(private readonly sessions?: InteractionSessionManager) {}
  public get listenerCount(): number {
    return this.#listeners.size;
  }
  public addListener(
    listener: InteractionListener,
    options: InteractionListenerOptions = {}
  ): () => void {
    this.#assertUsable();
    const id = this.#nextId++;
    this.#listeners.set(id, { id, listener, options, once: false });
    return () => {
      this.#listeners.delete(id);
    };
  }
  public once(listener: InteractionListener, options: InteractionListenerOptions = {}): () => void {
    this.#assertUsable();
    const id = this.#nextId++;
    this.#listeners.set(id, { id, listener, options, once: true });
    return () => {
      this.#listeners.delete(id);
    };
  }
  public removeListener(listener: InteractionListener): void {
    for (const [id, entry] of this.#listeners)
      if (entry.listener === listener) this.#listeners.delete(id);
  }
  public dispatch(
    event: InteractionEvent,
    path: readonly InteractionTarget[] = [event.target]
  ): boolean {
    this.#assertUsable();
    if (path.length === 0 || path.at(-1)?.id !== event.target.id)
      throw new Error("Propagation path must end with the event target.");
    this.sessions?.active?.update(event);
    const ancestors = path.slice(0, -1);
    for (const target of ancestors) {
      this.#notify(event, "capture", target);
      if (event.propagationStopped) return !event.defaultPrevented;
    }
    this.#notify(event, "target", event.target);
    if (!event.bubbles || this.#stopped(event)) return !event.defaultPrevented;
    for (const target of [...ancestors].reverse()) {
      this.#notify(event, "bubble", target);
      if (this.#stopped(event)) break;
    }
    return !event.defaultPrevented;
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#listeners.clear();
    this.sessions?.dispose();
    this.#disposed = true;
  }
  #notify(event: InteractionEvent, phase: PropagationPhase, target: InteractionTarget): void {
    event.setDispatchPosition(phase, target);
    const entries = [...this.#listeners.values()]
      .filter(
        ({ options }) =>
          (options.type === undefined || options.type === event.type) &&
          (options.phase === undefined || options.phase === "any" || options.phase === phase) &&
          (options.filter?.(event) ?? true)
      )
      .sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0) || a.id - b.id);
    for (const entry of entries) {
      if (!this.#listeners.has(entry.id)) continue;
      entry.listener(event);
      if (entry.once) this.#listeners.delete(entry.id);
      if (event.immediatePropagationStopped) break;
    }
  }
  #assertUsable(): void {
    if (this.#disposed) throw new Error("Interaction dispatcher is disposed.");
  }
  #stopped(event: InteractionEvent): boolean {
    return event.propagationStopped;
  }
}
export * from "./keyboard-dispatcher.js";
