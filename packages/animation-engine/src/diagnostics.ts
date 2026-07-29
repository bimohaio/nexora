import type { Phase10Diagnostic } from "./contracts.js";

export class DiagnosticCollector {
  readonly #limit: number;
  readonly #diagnostics: Phase10Diagnostic[] = [];

  public constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit <= 0)
      throw new RangeError("Diagnostic limit must be positive.");
    this.#limit = limit;
  }

  public report(diagnostic: Phase10Diagnostic): void {
    this.#diagnostics.push(Object.freeze({ ...diagnostic }));
    if (this.#diagnostics.length > this.#limit) this.#diagnostics.shift();
  }

  public snapshot(): readonly Phase10Diagnostic[] {
    return Object.freeze([...this.#diagnostics]);
  }

  public clear(): void {
    this.#diagnostics.length = 0;
  }
}
