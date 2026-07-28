import type { JsonValue } from "@web-scada/core";
import type {
  DataPointAddress,
  DataSourceErrorCode,
  DataSourceErrorSeverity,
  DataSourceMetadata,
  DataSourceOperation,
  SerializedDataSourceError
} from "./contracts.js";

export interface DataSourceErrorOptions {
  readonly severity?: DataSourceErrorSeverity;
  readonly recoverable?: boolean;
  readonly timestamp?: number;
  readonly operation?: DataSourceOperation;
  readonly adapterId?: string;
  readonly correlationId?: string;
  readonly address?: DataPointAddress;
  readonly context?: Readonly<Record<string, JsonValue>>;
  readonly cause?: unknown;
}

/** Typed error whose enumerable representation never includes its native cause. */
export class DataSourceError extends Error {
  public readonly code: DataSourceErrorCode;
  public readonly severity: DataSourceErrorSeverity;
  public readonly recoverable: boolean;
  public readonly timestamp: number;
  public readonly operation: DataSourceOperation | undefined;
  public readonly adapterId: string | undefined;
  public readonly correlationId: string | undefined;
  public readonly address: DataPointAddress | undefined;
  public readonly context: DataSourceMetadata;
  public override readonly cause?: unknown;

  public constructor(
    code: DataSourceErrorCode,
    message: string,
    options: DataSourceErrorOptions = {}
  ) {
    super(message);
    this.name = "DataSourceError";
    this.code = code;
    this.severity = options.severity ?? "error";
    this.recoverable = options.recoverable ?? false;
    this.timestamp = options.timestamp ?? Date.now();
    this.operation = options.operation;
    this.adapterId = options.adapterId;
    this.correlationId = options.correlationId;
    this.address = options.address;
    this.context = Object.freeze({ ...(options.context ?? {}) });
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        writable: false
      });
    }
  }

  public toJSON(): SerializedDataSourceError {
    return {
      name: "DataSourceError",
      code: this.code,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      ...(this.operation === undefined ? {} : { operation: this.operation }),
      ...(this.adapterId === undefined ? {} : { adapterId: this.adapterId }),
      ...(this.correlationId === undefined ? {} : { correlationId: this.correlationId }),
      ...(this.address === undefined ? {} : { address: this.address }),
      context: this.context
    };
  }
}

export function unsupportedOperation(operation: DataSourceOperation): DataSourceError {
  return new DataSourceError(
    "DATASOURCE_UNSUPPORTED_OPERATION",
    `Data-source operation '${operation}' is not supported.`,
    { operation }
  );
}

export function accessDenied(operation: DataSourceOperation): DataSourceError {
  return new DataSourceError(
    "DATASOURCE_ACCESS_DENIED",
    `Data-source operation '${operation}' is not permitted.`,
    { operation }
  );
}
