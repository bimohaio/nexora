import type { JsonValue } from "@web-scada/core";
import type {
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceMetadata,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";

export type WebSocketJsonPath = readonly (string | number)[];

export interface WebSocketEndpointConfig {
  readonly url: string;
  readonly protocols?: readonly string[];
  readonly allowInsecure?: boolean;
  readonly connectTimeoutMs?: number;
}

export interface WebSocketInboundMapping {
  readonly batchPath?: WebSocketJsonPath;
  readonly keyPath: WebSocketJsonPath;
  readonly valuePath: WebSocketJsonPath;
  readonly qualityPath?: WebSocketJsonPath;
  readonly timestampPath?: WebSocketJsonPath;
  readonly sequencePath?: WebSocketJsonPath;
  readonly metadataPath?: WebSocketJsonPath;
  readonly discriminatorPath?: WebSocketJsonPath;
  readonly discriminatorValue?: JsonValue;
}

export interface WebSocketCommandConfig {
  readonly subscribeType?: string;
  readonly unsubscribeType?: string;
}

export interface WebSocketHeartbeatConfig {
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly message: JsonValue;
  readonly responsePath?: WebSocketJsonPath;
  readonly responseValue?: JsonValue;
}

export interface WebSocketLimits {
  readonly messageBytes?: number;
  readonly batchItems?: number;
  readonly inboundQueue?: number;
}

export interface WebSocketAuthProvider {
  resolve(
    context: Readonly<{ adapterId: string; endpoint: string }>,
    signal?: AbortSignal
  ): Promise<Readonly<{ protocols?: readonly string[] }>>;
}

export interface WebSocketTransportClose {
  readonly code: number;
  readonly reason?: string;
}

export interface WebSocketTransport {
  readonly open: boolean;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  setHandlers(handlers: {
    readonly open: () => void;
    readonly message: (data: string | ArrayBuffer) => void;
    readonly close: (event: Readonly<WebSocketTransportClose>) => void;
    readonly error: (error: unknown) => void;
  }): void;
  clearHandlers(): void;
}

export interface WebSocketTransportFactory {
  connect(options: {
    readonly url: string;
    readonly protocols: readonly string[];
  }): WebSocketTransport;
}

export interface WebSocketDataSourceConfig {
  readonly identity: DataSourceIdentity;
  readonly endpoint: WebSocketEndpointConfig;
  readonly mapping: WebSocketInboundMapping;
  readonly commands?: WebSocketCommandConfig;
  readonly heartbeat?: WebSocketHeartbeatConfig;
  readonly limits?: WebSocketLimits;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly scheduler?: DataSourceScheduler;
  readonly transportFactory?: WebSocketTransportFactory;
  readonly authProvider?: WebSocketAuthProvider;
  readonly allowedHosts?: readonly string[];
  readonly metadata?: DataSourceMetadata;
  readonly onDiagnostic?: (diagnostic: Readonly<WebSocketDiagnostic>) => void;
}

export interface WebSocketDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly timestamp: number;
  readonly endpoint: string;
}

export type WebSocketDataSource = DataSourceAdapter;
