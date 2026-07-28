import type { DataSourceErrorCode, SerializedDataSourceError } from "./contracts.js";
import { DataSourceError } from "./errors.js";
import { assertDelay } from "./scheduling.js";

export interface RandomSource {
  next(): number;
}

export interface ReconnectContext {
  /** One-based retry number. */
  readonly attempt: number;
  readonly error: Readonly<SerializedDataSourceError>;
}

export interface ReconnectPolicy {
  readonly enabled: boolean;
  readonly maxAttempts: number;
  shouldReconnect(context: Readonly<ReconnectContext>): boolean;
  getDelay(context: Readonly<ReconnectContext>): number;
}

export interface ExponentialReconnectPolicyOptions {
  readonly enabled?: boolean;
  readonly maxAttempts?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly multiplier?: number;
  readonly jitterRatio?: number;
  readonly random?: RandomSource;
  readonly retryableCodes?: readonly DataSourceErrorCode[];
}

const DEFAULT_RETRYABLE: readonly DataSourceErrorCode[] = Object.freeze([
  "DATASOURCE_CONNECTION_ERROR",
  "DATASOURCE_DISCONNECTION_ERROR",
  "DATASOURCE_NOT_CONNECTED",
  "DATASOURCE_TIMEOUT",
  "DATASOURCE_INTERNAL_ERROR"
]);

export function createExponentialReconnectPolicy(
  options: Readonly<ExponentialReconnectPolicyOptions> = {}
): ReconnectPolicy {
  const enabled = options.enabled ?? true;
  const maxAttempts = options.maxAttempts ?? 5;
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const multiplier = options.multiplier ?? 2;
  const jitterRatio = options.jitterRatio ?? 0;
  const random = options.random ?? { next: Math.random };
  const retryable = new Set(options.retryableCodes ?? DEFAULT_RETRYABLE);

  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0)
    invalid("maxAttempts must be a non-negative safe integer.");
  assertDelay(initialDelayMs, "initialDelayMs");
  assertDelay(maxDelayMs, "maxDelayMs");
  if (maxDelayMs < initialDelayMs) invalid("maxDelayMs must be at least initialDelayMs.");
  if (!Number.isFinite(multiplier) || multiplier < 1) invalid("multiplier must be at least one.");
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1)
    invalid("jitterRatio must be between zero and one.");

  return Object.freeze({
    enabled,
    maxAttempts,
    shouldReconnect(context: Readonly<ReconnectContext>): boolean {
      return (
        enabled &&
        context.attempt <= maxAttempts &&
        context.error.recoverable &&
        retryable.has(context.error.code)
      );
    },
    getDelay(context: Readonly<ReconnectContext>): number {
      const exponent = Math.max(0, context.attempt - 1);
      const bounded = Math.min(maxDelayMs, initialDelayMs * multiplier ** exponent);
      const sample = random.next();
      if (!Number.isFinite(sample) || sample < 0 || sample > 1)
        invalid("Random source must return a value between zero and one.");
      const factor = 1 + (sample * 2 - 1) * jitterRatio;
      return Math.max(0, Math.min(maxDelayMs, Math.round(bounded * factor)));
    }
  });
}

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message, {
    operation: "connect"
  });
}
