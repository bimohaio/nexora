import type { InteractionEvent } from "../events/index.js";
import type { Disposable } from "../types/index.js";

export interface InteractionAdapter<TSourceEvent = unknown> extends Disposable {
  connect(dispatch: (event: InteractionEvent) => void): void;
  disconnect(): void;
  normalize(event: Readonly<TSourceEvent>): InteractionEvent | undefined;
}

export abstract class BaseInteractionAdapter<
  TSourceEvent = unknown
> implements InteractionAdapter<TSourceEvent> {
  #dispatch: ((event: InteractionEvent) => void) | undefined;
  #disposed = false;
  public connect(dispatch: (event: InteractionEvent) => void): void {
    if (this.#disposed) throw new Error("Interaction adapter is disposed.");
    if (this.#dispatch !== undefined) throw new Error("Interaction adapter is already connected.");
    this.#dispatch = dispatch;
    this.onConnect();
  }
  public disconnect(): void {
    if (this.#dispatch === undefined) return;
    this.onDisconnect();
    this.#dispatch = undefined;
  }
  public emit(source: Readonly<TSourceEvent>): void {
    const event = this.normalize(source);
    if (event !== undefined) this.#dispatch?.(event);
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.disconnect();
    this.#disposed = true;
  }
  public abstract normalize(event: Readonly<TSourceEvent>): InteractionEvent | undefined;
  protected abstract onConnect(): void;
  protected abstract onDisconnect(): void;
}
