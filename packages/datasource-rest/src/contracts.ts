import type { JsonValue } from "@web-scada/core";
import type {
  DataPointAddress,
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceMetadata,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";

export type RestMethod = "GET" | "POST" | "PUT" | "PATCH";
export type JsonPath = readonly (string | number)[];
export type JsonExpectedType = "null" | "boolean" | "number" | "string" | "array" | "object";

export interface RestEndpointConfig {
  readonly url: string;
  readonly method?: RestMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly allowInsecure?: boolean;
  readonly timeoutMs?: number;
}

export interface RestPointMapping {
  readonly address: DataPointAddress;
  readonly path: JsonPath;
  readonly qualityPath?: JsonPath;
  readonly timestampPath?: JsonPath;
  readonly sequencePath?: JsonPath;
  readonly expectedType?: JsonExpectedType;
  readonly metadata?: DataSourceMetadata;
}

export interface RestResponseMapping {
  readonly parser?: "json";
  readonly points: readonly RestPointMapping[];
  readonly timestampPath?: JsonPath;
}

export interface RestPollingConfig {
  /** Fixed delay after a completed request. */
  readonly intervalMs: number;
  readonly emitImmediately?: boolean;
}

export interface RestWriteConfig {
  readonly endpoint: RestEndpointConfig;
  readonly bodyShape?: "items";
}

export interface RestPayloadLimits {
  readonly responseBytes?: number;
  readonly requestBytes?: number;
  readonly jsonDepth?: number;
  readonly maxRetryAfterMs?: number;
}

export interface RestAuthContext {
  readonly adapterId: string;
  readonly operation: "connect" | "read" | "write" | "subscribe";
  readonly endpoint: string;
}

export interface RestResolvedAuth {
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RestAuthProvider {
  resolve(
    context: Readonly<RestAuthContext>,
    signal?: AbortSignal
  ): Promise<Readonly<RestResolvedAuth>>;
}

export interface HttpTransportRequest {
  readonly url: string;
  readonly method: RestMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpTransportResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}

export interface HttpTransport {
  execute(
    request: Readonly<HttpTransportRequest>,
    signal?: AbortSignal
  ): Promise<Readonly<HttpTransportResponse>>;
}

export interface RestDataSourceConfig {
  readonly identity: DataSourceIdentity;
  readonly endpoint: RestEndpointConfig;
  readonly response: RestResponseMapping;
  readonly polling?: RestPollingConfig;
  readonly write?: RestWriteConfig;
  readonly limits?: RestPayloadLimits;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly scheduler?: DataSourceScheduler;
  readonly transport?: HttpTransport;
  readonly authProvider?: RestAuthProvider;
  readonly allowedHosts?: readonly string[];
  readonly onDiagnostic?: (diagnostic: Readonly<RestDiagnostic>) => void;
}

export interface RestDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly timestamp: number;
  readonly endpoint: string;
}

export type RestDataSource = DataSourceAdapter;

export type RestWriteBody = Readonly<{
  items: readonly Readonly<{ key: string; value: JsonValue }>[];
}>;
