import type { JsonValue } from "@web-scada/core";

export type RuntimeErrorCode =
  | "RUNTIME_DISPOSED"
  | "RUNTIME_VALUE_INVALID"
  | "RUNTIME_CONFIGURATION_INVALID"
  | "RUNTIME_REENTRANT_UPDATE"
  | "RUNTIME_LIFECYCLE_INVALID"
  | "RUNTIME_SUBSCRIPTION_INVALID"
  | (string & {});

export type RuntimeErrorCategory =
  | "RUNTIME_ERROR"
  | "SNAPSHOT_ERROR"
  | "DISPATCH_ERROR"
  | "RESOLVER_ERROR"
  | "SUBSCRIPTION_ERROR"
  | "SCHEDULER_ERROR"
  | "SIMULATOR_ERROR"
  | "VALIDATION_ERROR";

export type RuntimeSeverity = "debug" | "info" | "warning" | "error" | "fatal";

export interface RuntimeErrorOptions {
  readonly category?: RuntimeErrorCategory;
  readonly severity?: RuntimeSeverity;
  readonly timestamp?: string;
  readonly context?: Readonly<Record<string, JsonValue>>;
  readonly recoverable?: boolean;
  readonly cause?: unknown;
}

/** Typed, immutable error safe to pass across runtime package boundaries. */
export class RuntimeEngineError extends Error {
  public readonly category: RuntimeErrorCategory;
  public readonly severity: RuntimeSeverity;
  public readonly timestamp: string;
  public readonly context: Readonly<Record<string, JsonValue>>;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;

  public constructor(code: RuntimeErrorCode, message: string, options: RuntimeErrorOptions = {}) {
    super(message);
    this.name = "RuntimeEngineError";
    this.code = code;
    this.category = options.category ?? "RUNTIME_ERROR";
    this.severity = options.severity ?? "error";
    this.timestamp = options.timestamp ?? new Date().toISOString();
    this.context = Object.freeze({ ...(options.context ?? {}) });
    this.recoverable = options.recoverable ?? false;
    if (options.cause !== undefined)
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        writable: false
      });
    Object.freeze(this.context);
    Object.freeze(this);
  }

  public readonly code: RuntimeErrorCode;
}

export function toRuntimeError(
  cause: unknown,
  code: RuntimeErrorCode,
  message: string,
  options: Omit<RuntimeErrorOptions, "cause"> = {}
): RuntimeEngineError {
  return cause instanceof RuntimeEngineError
    ? cause
    : new RuntimeEngineError(code, message, { ...options, cause });
}
