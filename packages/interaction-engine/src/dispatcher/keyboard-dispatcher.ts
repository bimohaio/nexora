import type { KeyboardEvent, KeyboardEventListener } from "../events/keyboard-events.js";

export class KeyboardDispatcher {
  readonly #listeners = new Set<KeyboardEventListener>();
  #disposed = false;
  public subscribe(listener: KeyboardEventListener): () => void {
    if (this.#disposed) throw new Error("Keyboard dispatcher is disposed.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public dispatch(event: KeyboardEvent): void {
    if (this.#disposed) return;
    const immutable = Object.freeze({ ...event }) as KeyboardEvent;
    for (const listener of [...this.#listeners]) listener(immutable);
  }
  public dispose(): void {
    this.#listeners.clear();
    this.#disposed = true;
  }
}
