import type { JsonValue } from "@web-scada/core";
import type { RuntimeDiagnostic } from "./contracts.js";
import type { RuntimeLogger } from "./logging.js";
import { NoopRuntimeLogger } from "./logging.js";
import { RuntimeMetrics } from "./metrics.js";

export type RuntimeHealthStatus = "Healthy" | "Warning" | "Degraded" | "Critical" | "Recovered";

export interface AggregatedRuntimeDiagnostic extends RuntimeDiagnostic {
  readonly id: string;
  readonly occurrenceCount: number;
  readonly firstOccurrence: string;
  readonly lastOccurrence: string;
  readonly suppressed: boolean;
}

export interface RuntimeDiagnosticsOptions {
  readonly limit?: number;
  readonly suppressionThreshold?: number;
  readonly logger?: RuntimeLogger;
  readonly metrics?: RuntimeMetrics;
}

const SENSITIVE = /credential|password|secret|token|authorization|cookie|api[-_]?key/i;

export function sanitizeDiagnosticContext(
  context: Readonly<Record<string, JsonValue>>
): Readonly<Record<string, JsonValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(context).map(([key, value]) => [
        key,
        SENSITIVE.test(key) ? "[REDACTED]" : value
      ])
    )
  );
}

export class RuntimeDiagnosticsService {
  readonly #issues = new Map<string, AggregatedRuntimeDiagnostic>();
  readonly #limit: number;
  readonly #threshold: number;
  readonly #logger: RuntimeLogger;
  readonly #metrics: RuntimeMetrics;
  #hadIssue = false;

  public constructor(options: RuntimeDiagnosticsOptions = {}) {
    this.#limit = positiveInteger(options.limit, 100);
    this.#threshold = positiveInteger(options.suppressionThreshold, 5);
    this.#logger = options.logger ?? new NoopRuntimeLogger();
    this.#metrics = options.metrics ?? new RuntimeMetrics();
  }

  public report(issue: RuntimeDiagnostic): AggregatedRuntimeDiagnostic {
    const context = sanitizeDiagnosticContext(issue.context);
    const key = `${issue.code}|${issue.severity}|${issue.message}|${JSON.stringify(context)}`;
    const existing = this.#issues.get(key);
    const count = (existing?.occurrenceCount ?? 0) + 1;
    const diagnostic = Object.freeze({
      ...issue,
      context,
      id: key,
      occurrenceCount: count,
      firstOccurrence: existing?.firstOccurrence ?? issue.timestamp,
      lastOccurrence: issue.timestamp,
      suppressed: count > this.#threshold
    });
    this.#issues.delete(key);
    this.#issues.set(key, diagnostic);
    while (this.#issues.size > this.#limit) {
      const oldest = this.#issues.keys().next().value;
      if (oldest === undefined) break;
      this.#issues.delete(oldest);
    }
    this.#hadIssue = true;
    if (issue.severity === "warning") this.#metrics.recordWarning();
    if (issue.severity === "error" || issue.severity === "fatal") this.#metrics.recordError();
    if (!diagnostic.suppressed)
      this.#logger.log({
        level: issue.severity === "warning" ? "warn" : issue.severity,
        code: issue.code,
        message: issue.message,
        timestamp: issue.timestamp,
        context,
        occurrenceCount: count
      });
    return diagnostic;
  }

  public getDiagnostics(): readonly AggregatedRuntimeDiagnostic[] {
    return Object.freeze([...this.#issues.values()]);
  }
  public clear(id?: string): void {
    if (id === undefined) this.#issues.clear();
    else
      for (const [key, issue] of this.#issues)
        if (issue.id === id || issue.code === id) this.#issues.delete(key);
  }
  public getHealth(): RuntimeHealthStatus {
    const issues = [...this.#issues.values()];
    if (issues.some((issue) => issue.severity === "fatal" && !issue.recoverable)) return "Critical";
    if (issues.some((issue) => issue.severity === "error")) return "Degraded";
    if (issues.some((issue) => issue.severity === "warning")) return "Warning";
    return this.#hadIssue ? "Recovered" : "Healthy";
  }
  public get metrics(): RuntimeMetrics {
    return this.#metrics;
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
