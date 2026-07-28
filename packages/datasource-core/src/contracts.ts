import type { JsonValue } from "@web-scada/core";

export type DataSourceMetadata = Readonly<Record<string, JsonValue>>;

export interface DataSourceIdentity {
  readonly id: string;
  readonly type: string;
  readonly displayName?: string;
  readonly namespace?: string;
  readonly version?: string;
  readonly metadata?: DataSourceMetadata;
}

export const DATA_SOURCE_OPERATIONS = [
  "connect",
  "disconnect",
  "subscribe",
  "read",
  "write",
  "browse",
  "batchRead",
  "batchWrite",
  "historyRead",
  "metadata"
] as const;
export type DataSourceOperation = (typeof DATA_SOURCE_OPERATIONS)[number];
export type DataSourceCapabilities = Readonly<Record<DataSourceOperation, boolean>>;

export const DATA_SOURCE_PERMISSIONS = [
  "READ",
  "WRITE",
  "SUBSCRIBE",
  "BROWSE",
  "HISTORY_READ"
] as const;
export type DataSourcePermission = (typeof DATA_SOURCE_PERMISSIONS)[number];
export type DataSourcePermissions = Readonly<Record<DataSourcePermission, boolean>>;

export const NO_DATA_SOURCE_PERMISSIONS: DataSourcePermissions = Object.freeze({
  READ: false,
  WRITE: false,
  SUBSCRIBE: false,
  BROWSE: false,
  HISTORY_READ: false
});

export type DataSourceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected"
  | "reconnecting"
  | "failed"
  | "disposed";

export interface DataSourceStatus {
  readonly state: DataSourceConnectionState;
  /** Unix epoch milliseconds. */
  readonly changedAt: number;
  readonly attempt?: number;
  readonly diagnostic?: DataSourceDiagnostic;
}

export interface DataPointAddress {
  readonly sourceId: string;
  readonly key: string;
  readonly namespace?: string;
  readonly path?: readonly string[];
  readonly extensions?: DataSourceMetadata;
}

export const DATA_QUALITY_LEVELS = ["GOOD", "UNCERTAIN", "BAD", "UNKNOWN"] as const;
export type DataQualityLevel = (typeof DATA_QUALITY_LEVELS)[number];
export const DATA_QUALITY_REASONS = [
  "GOOD",
  "STALE",
  "INITIALIZING",
  "SUBSTITUTED",
  "OUT_OF_RANGE",
  "SENSOR_FAILURE",
  "COMMUNICATION_FAILURE",
  "TIMEOUT",
  "NOT_CONNECTED",
  "ACCESS_DENIED",
  "NOT_FOUND",
  "CONFIGURATION_ERROR",
  "PARSE_ERROR",
  "UNSUPPORTED",
  "UNKNOWN"
] as const;
export type DataQualityReason = (typeof DATA_QUALITY_REASONS)[number];

export interface DataQuality {
  readonly level: DataQualityLevel;
  readonly reason?: DataQualityReason;
  /** Safe, adapter-supplied raw status identifier. */
  readonly code?: string;
  readonly message?: string;
}

export const DATA_QUALITY_RANK: Readonly<Record<DataQualityLevel, number>> = Object.freeze({
  GOOD: 0,
  UNCERTAIN: 1,
  UNKNOWN: 2,
  BAD: 3
});

export interface DataPointValue {
  readonly address: DataPointAddress;
  readonly value: JsonValue;
  readonly quality: DataQuality;
  /** Unix epoch milliseconds; omitted when the source supplied no timestamp. */
  readonly sourceTimestamp?: number;
  /** Unix epoch milliseconds assigned at ingestion. */
  readonly receivedTimestamp: number;
  readonly sequence?: number;
  readonly metadata?: DataSourceMetadata;
  readonly diagnostics?: readonly DataSourceDiagnostic[];
}

export type DataSourceDiagnosticSeverity = "info" | "warning" | "error";
export type DataSourceDiagnosticCode =
  | "DATASOURCE_TIMESTAMP_FALLBACK"
  | "DATASOURCE_QUALITY_UNKNOWN"
  | "DATASOURCE_OPTION_DEGRADED"
  | "DATASOURCE_VALUE_SUBSTITUTED"
  | "DATASOURCE_VALIDATION_ERROR";

export interface DataSourceDiagnostic {
  readonly code: DataSourceDiagnosticCode;
  readonly severity: DataSourceDiagnosticSeverity;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: DataSourceMetadata;
}

export type DataSourceErrorCode =
  | "DATASOURCE_CONFIGURATION_ERROR"
  | "DATASOURCE_CONNECTION_ERROR"
  | "DATASOURCE_DISCONNECTION_ERROR"
  | "DATASOURCE_NOT_CONNECTED"
  | "DATASOURCE_ACCESS_DENIED"
  | "DATASOURCE_UNSUPPORTED_OPERATION"
  | "DATASOURCE_SUBSCRIPTION_ERROR"
  | "DATASOURCE_READ_ERROR"
  | "DATASOURCE_WRITE_ERROR"
  | "DATASOURCE_TIMEOUT"
  | "DATASOURCE_PARSE_ERROR"
  | "DATASOURCE_NORMALIZATION_ERROR"
  | "DATASOURCE_DISPOSED"
  | "DATASOURCE_INTERNAL_ERROR";

export type DataSourceErrorSeverity = "warning" | "error" | "fatal";

export interface SerializedDataSourceError {
  readonly name: "DataSourceError";
  readonly code: DataSourceErrorCode;
  readonly message: string;
  readonly severity: DataSourceErrorSeverity;
  readonly recoverable: boolean;
  readonly timestamp: number;
  readonly operation?: DataSourceOperation;
  readonly adapterId?: string;
  readonly correlationId?: string;
  readonly address?: DataPointAddress;
  readonly context: DataSourceMetadata;
}

export interface DataSourceEventBase {
  readonly adapter: DataSourceIdentity;
  /** Unix epoch milliseconds. */
  readonly timestamp: number;
  readonly sequence?: number;
  readonly correlationId?: string;
  readonly metadata?: DataSourceMetadata;
}

export interface DataSourceValueEvent extends DataSourceEventBase {
  readonly type: "VALUE";
  readonly value: DataPointValue;
}
export interface DataSourceStatusEvent extends DataSourceEventBase {
  readonly type: "STATUS";
  readonly status: DataSourceStatus;
}
export interface DataSourceErrorEvent extends DataSourceEventBase {
  readonly type: "ERROR";
  readonly error: SerializedDataSourceError;
}
export interface DataSourceDiagnosticEvent extends DataSourceEventBase {
  readonly type: "DIAGNOSTIC";
  readonly diagnostic: DataSourceDiagnostic;
}
export interface DataSourceMetadataEvent extends DataSourceEventBase {
  readonly type: "METADATA";
  readonly address?: DataPointAddress;
  readonly pointMetadata: DataSourceMetadata;
}
export type DataSourceEvent =
  | DataSourceValueEvent
  | DataSourceStatusEvent
  | DataSourceErrorEvent
  | DataSourceDiagnosticEvent
  | DataSourceMetadataEvent;
export type DataSourceEventListener = (event: DataSourceEvent) => void;

export type DeadbandDefinition =
  | { readonly type: "absolute"; readonly value: number }
  | { readonly type: "percent"; readonly value: number };

export interface SubscriptionRequest {
  readonly id?: string;
  readonly addresses: readonly DataPointAddress[];
  readonly samplingIntervalMs?: number;
  readonly publishIntervalMs?: number;
  readonly deadband?: DeadbandDefinition;
  readonly queueSize?: number;
  readonly discardOldest?: boolean;
  readonly metadata?: DataSourceMetadata;
}

export interface SubscriptionHandle {
  readonly id: string;
  readonly closed: boolean;
  /** Idempotent; completion means adapter-side release has completed. */
  unsubscribe(): void | Promise<void>;
}

export interface ReadRequest {
  readonly addresses: readonly DataPointAddress[];
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly metadata?: DataSourceMetadata;
}
export interface DataPointFailure {
  readonly address: DataPointAddress;
  readonly error: SerializedDataSourceError;
}
export interface ReadResult {
  readonly values: readonly DataPointValue[];
  readonly failures: readonly DataPointFailure[];
}

export interface WriteItem {
  readonly address: DataPointAddress;
  readonly value: JsonValue;
  readonly expectedType?: "null" | "boolean" | "number" | "string" | "array" | "object";
  readonly sourceTimestamp?: number;
  readonly metadata?: DataSourceMetadata;
}
export interface WriteRequest {
  readonly items: readonly WriteItem[];
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly metadata?: DataSourceMetadata;
}
export type WriteItemResult =
  | { readonly ok: true; readonly address: DataPointAddress }
  | {
      readonly ok: false;
      readonly address: DataPointAddress;
      readonly error: SerializedDataSourceError;
    };
export interface WriteResult {
  readonly results: readonly WriteItemResult[];
}

export interface BrowseRequest {
  readonly parent?: DataPointAddress;
  readonly limit?: number;
  readonly continuationToken?: string;
}
export interface DataPointDescriptor {
  readonly address: DataPointAddress;
  readonly displayName?: string;
  readonly dataType?: string;
  readonly readable?: boolean;
  readonly writable?: boolean;
  readonly engineeringUnit?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly metadata?: DataSourceMetadata;
}
export interface BrowseResult {
  readonly points: readonly DataPointDescriptor[];
  readonly continuationToken?: string;
}

export interface DataSourceAdapter {
  readonly identity: DataSourceIdentity;
  readonly capabilities: DataSourceCapabilities;
  readonly permissions: DataSourcePermissions;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): SubscriptionHandle | Promise<SubscriptionHandle>;
  read(request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>>;
  write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>>;
  browse(request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>>;
  getStatus(): Readonly<DataSourceStatus>;
  /** Idempotent. The disposed state is terminal. */
  dispose(): Promise<void>;
}
