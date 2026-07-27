import { ProfilingError } from "../errors/index.js";
import type { ProfileSpan } from "../types/performance.js";

export interface InteractionProfilerOptions {
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly maximumSpans?: number;
}

export class InteractionProfiler {
  readonly #enabled: boolean;
  readonly #now: () => number;
  readonly #maximumSpans: number;
  readonly #spans: ProfileSpan[] = [];
  #disposed = false;
  public constructor(options: InteractionProfilerOptions = {}) {
    this.#enabled = options.enabled ?? false;
    this.#now = options.now ?? (() => performance.now());
    this.#maximumSpans = options.maximumSpans ?? 1_000;
  }
  public begin(
    name: string,
    metadata: Readonly<Record<string, string | number | boolean>> = {}
  ): () => ProfileSpan | undefined {
    this.#assertUsable();
    if (!this.#enabled) return () => undefined;
    if (name.trim() === "")
      throw new ProfilingError("PROFILING_SPAN_INVALID", "Profile span requires a name.");
    const startedAt = this.#now();
    let completed = false;
    return () => {
      if (completed) return undefined;
      completed = true;
      const endedAt = this.#now();
      const span: ProfileSpan = Object.freeze({
        name,
        startedAt,
        endedAt,
        duration: Math.max(0, endedAt - startedAt),
        metadata: Object.freeze({ ...metadata })
      });
      this.#spans.push(span);
      if (this.#spans.length > this.#maximumSpans) this.#spans.shift();
      return span;
    };
  }
  public measure<TResult>(
    name: string,
    operation: () => TResult,
    metadata?: Readonly<Record<string, string | number | boolean>>
  ): TResult {
    const end = this.begin(name, metadata);
    try {
      return operation();
    } finally {
      end();
    }
  }
  public snapshot(): readonly ProfileSpan[] {
    return Object.freeze([...this.#spans]);
  }
  public clear(): void {
    this.#spans.length = 0;
  }
  public dispose(): void {
    this.clear();
    this.#disposed = true;
  }
  #assertUsable(): void {
    if (this.#disposed) throw new ProfilingError("PROFILING_DISPOSED", "Profiler is disposed.");
  }
}
