import type { ReducedMotionState } from "./scheduler-contracts.js";

interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: (event: { readonly matches: boolean }) => void): void;
  removeEventListener?(
    type: "change",
    listener: (event: { readonly matches: boolean }) => void
  ): void;
}

interface MatchMediaHost {
  matchMedia?(query: string): MediaQueryListLike;
}

/** Disposable, injected browser preference adapter; it owns exactly one media-query listener. */
export class BrowserReducedMotionSource {
  readonly #query: MediaQueryListLike;
  readonly #listeners = new Set<(state: ReducedMotionState) => void>();
  readonly #onChange = (event: { readonly matches: boolean }): void => {
    const state = event.matches ? "reduce" : "no-preference";
    for (const listener of [...this.#listeners]) listener(state);
  };
  #disposed = false;

  public constructor(host: MatchMediaHost = globalThis as MatchMediaHost) {
    if (typeof host.matchMedia !== "function") throw new Error("matchMedia is unavailable.");
    this.#query = host.matchMedia("(prefers-reduced-motion: reduce)");
    this.#query.addEventListener?.("change", this.#onChange);
  }

  public getCurrent(): ReducedMotionState {
    return this.#query.matches ? "reduce" : "no-preference";
  }

  public subscribe(listener: (state: ReducedMotionState) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#query.removeEventListener?.("change", this.#onChange);
    this.#listeners.clear();
    this.#disposed = true;
  }
}

interface DocumentVisibilityHost {
  readonly visibilityState?: string;
  addEventListener?(type: "visibilitychange", listener: () => void): void;
  removeEventListener?(type: "visibilitychange", listener: () => void): void;
}

/** Normalizes document visibility without accessing `document` at module import time. */
export class BrowserDocumentVisibilitySource {
  readonly #host: DocumentVisibilityHost;
  readonly #listeners = new Set<(hidden: boolean) => void>();
  readonly #onChange = (): void => {
    const hidden = this.isHidden();
    for (const listener of [...this.#listeners]) listener(hidden);
  };
  #disposed = false;

  public constructor(host?: DocumentVisibilityHost) {
    const resolved =
      host ?? (globalThis as unknown as { readonly document?: DocumentVisibilityHost }).document;
    if (resolved === undefined) throw new Error("document visibility is unavailable.");
    this.#host = resolved;
    this.#host.addEventListener?.("visibilitychange", this.#onChange);
  }

  public isHidden(): boolean {
    return this.#host.visibilityState === "hidden";
  }

  public subscribe(listener: (hidden: boolean) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#host.removeEventListener?.("visibilitychange", this.#onChange);
    this.#listeners.clear();
    this.#disposed = true;
  }
}
