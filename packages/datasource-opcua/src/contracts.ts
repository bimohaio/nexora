import type { JsonValue } from "@web-scada/core";
import type {
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";

export type OpcUaSecurityMode = "None" | "Sign" | "SignAndEncrypt";
export type OpcUaSecurityPolicy =
  "None" | "Basic256Sha256" | "Aes128_Sha256_RsaOaep" | "Aes256_Sha256_RsaPss";
export type OpcUaIdentity =
  | { readonly type: "anonymous" }
  | { readonly type: "username"; readonly secretRef: string }
  | {
      readonly type: "certificate";
      readonly certificateRef: string;
      readonly privateKeyRef: string;
    };

export interface OpcUaResolvedSecret {
  readonly username?: string;
  readonly password?: string;
  readonly certificateFile?: string;
  readonly privateKeyFile?: string;
}
export type OpcUaSecretProvider = (
  reference: string,
  signal?: AbortSignal
) => Promise<Readonly<OpcUaResolvedSecret>>;

export interface OpcUaPointDefinition {
  readonly id: string;
  /** NodeId, ExpandedNodeId (`nsu=...`), or absolute browse path. */
  readonly address: string;
  readonly dataType?: string;
  readonly writable?: boolean;
  readonly displayName?: string;
}
export interface OpcUaAdapterConfig {
  readonly identity: DataSourceIdentity;
  readonly endpointUrl: string;
  readonly discoveryUrl?: string;
  readonly security?: {
    readonly mode: OpcUaSecurityMode;
    readonly policy: OpcUaSecurityPolicy;
    readonly certificateFile?: string;
    readonly privateKeyFile?: string;
    readonly automaticallyAcceptUnknownCertificate?: boolean;
  };
  readonly userIdentity?: OpcUaIdentity;
  readonly secretProvider?: OpcUaSecretProvider;
  readonly session?: {
    readonly requestedSessionTimeoutMs?: number;
    readonly operationTimeoutMs?: number;
    readonly keepSessionAlive?: boolean;
  };
  readonly subscription?: {
    readonly publishingIntervalMs?: number;
    readonly samplingIntervalMs?: number;
    readonly queueSize?: number;
  };
  readonly limits?: {
    readonly maxNodesPerRead?: number;
    readonly maxNodesPerWrite?: number;
    readonly maxBrowseResults?: number;
  };
  readonly writes?: { readonly enabled: boolean };
  readonly methods?: { readonly enabled: boolean };
  readonly points?: readonly OpcUaPointDefinition[];
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly scheduler?: DataSourceScheduler;
}
export interface OpcUaMethodCallRequest {
  readonly objectId: string;
  readonly methodId: string;
  readonly inputArguments?: readonly JsonValue[];
  readonly timeoutMs?: number;
}
export interface OpcUaMethodCallResult {
  readonly statusCode: string;
  readonly outputArguments: readonly JsonValue[];
}
export interface OpcUaDiagnosticsSnapshot {
  readonly endpointUrl: string;
  readonly sessionActive: boolean;
  readonly subscriptionCount: number;
  readonly monitoredItemCount: number;
  readonly reconnectCount: number;
  readonly completedReads: number;
  readonly completedWrites: number;
  readonly lastError?: string;
}
export interface OpcUaDataSource extends DataSourceAdapter {
  callMethod(request: Readonly<OpcUaMethodCallRequest>): Promise<Readonly<OpcUaMethodCallResult>>;
  getDiagnostics(): Readonly<OpcUaDiagnosticsSnapshot>;
}
