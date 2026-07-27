import type { JsonValue } from "@web-scada/core";
import type { RuntimeSeverity } from "./errors.js";

export type RuntimeLogLevel = Exclude<RuntimeSeverity, "warning"> | "warn";

export interface RuntimeLogEntry {
  readonly level: RuntimeLogLevel;
  readonly code?: string;
  readonly message: string;
  readonly timestamp: string;
  readonly context: Readonly<Record<string, JsonValue>>;
  readonly occurrenceCount?: number;
}

export interface RuntimeLogger {
  log(entry: Readonly<RuntimeLogEntry>): void;
}

export class NoopRuntimeLogger implements RuntimeLogger {
  public log(_entry: Readonly<RuntimeLogEntry>): void {
    // Intentionally disabled.
  }
}

export class MemoryRuntimeLogger implements RuntimeLogger {
  readonly #entries: RuntimeLogEntry[] = [];
  public log(entry: Readonly<RuntimeLogEntry>): void {
    this.#entries.push(Object.freeze({ ...entry, context: Object.freeze({ ...entry.context }) }));
  }
  public getEntries(): readonly RuntimeLogEntry[] {
    return Object.freeze([...this.#entries]);
  }
  public clear(): void {
    this.#entries.length = 0;
  }
}
