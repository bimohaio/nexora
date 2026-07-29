import type { JsonValue } from "@web-scada/core";
import type {
  DataPointAddress,
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceMetadata,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";

export type MqttProtocolVersion = 4 | 5;
export type MqttQos = 0 | 1 | 2;
export type MqttRetainHandling = 0 | 1 | 2;
export type MqttJsonPath = readonly (string | number)[];
export type MqttRetainedPolicy = "ACCEPT" | "IGNORE" | "ACCEPT_INITIAL_ONLY";
export type MqttTopicRedaction = "FULL" | "PREFIX_ONLY" | "REDACT";

export interface MqttWillConfig {
  readonly topic: string;
  readonly payload: string;
  readonly qos?: MqttQos;
  readonly retain?: boolean;
  readonly delayIntervalSeconds?: number;
}

export interface MqttConnectionConfig {
  readonly url: string;
  readonly protocolVersion: MqttProtocolVersion;
  readonly clientId: string;
  readonly cleanStart: boolean;
  readonly sessionExpiryIntervalSeconds?: number;
  readonly keepAliveSeconds?: number;
  readonly connectTimeoutMs?: number;
  readonly allowInsecure?: boolean;
  readonly usernameCredentialRef?: string;
  readonly passwordCredentialRef?: string;
  readonly tlsConfigRef?: string;
  readonly will?: MqttWillConfig;
}

export type MqttPayloadDecoder =
  | { readonly type: "json" }
  | { readonly type: "text" }
  | { readonly type: "number" }
  | {
      readonly type: "boolean";
      readonly trueToken?: string;
      readonly falseToken?: string;
      readonly caseSensitive?: boolean;
    }
  | { readonly type: "base64" };

export interface MqttMessageMapping {
  readonly address?: DataPointAddress;
  readonly topicTemplate?: string;
  readonly addressKeyTemplate?: string;
  readonly decoder: MqttPayloadDecoder;
  readonly batchPath?: MqttJsonPath;
  readonly pointKeyPath?: MqttJsonPath;
  readonly valuePath?: MqttJsonPath;
  readonly qualityPath?: MqttJsonPath;
  readonly timestampPath?: MqttJsonPath;
  readonly timestampUnit?: "milliseconds" | "seconds" | "iso8601";
  readonly sequencePath?: MqttJsonPath;
}

export interface MqttSubscriptionDefinition {
  readonly id?: string;
  readonly topicFilter: string;
  readonly qos: MqttQos;
  readonly noLocal?: boolean;
  readonly retainAsPublished?: boolean;
  readonly retainHandling?: MqttRetainHandling;
  readonly retainedPolicy?: MqttRetainedPolicy;
  readonly mapping: MqttMessageMapping;
  readonly metadata?: DataSourceMetadata;
}

export interface MqttPublishMapping {
  readonly address: DataPointAddress;
  readonly topic: string;
  readonly payloadType: "json" | "text";
  readonly qos?: MqttQos;
  readonly retain?: boolean;
  readonly allowRetain?: boolean;
  readonly metadata?: DataSourceMetadata;
}

export interface MqttLimits {
  readonly payloadBytes?: number;
  readonly inboundQueue?: number;
  readonly batchItems?: number;
  readonly maxInflightPublishes?: number;
  readonly publishTimeoutMs?: number;
}

export interface MqttCredentialProvider {
  resolve(
    context: Readonly<{
      adapterId: string;
      endpoint: string;
      usernameCredentialRef?: string;
      passwordCredentialRef?: string;
      tlsConfigRef?: string;
    }>,
    signal?: AbortSignal
  ): Promise<Readonly<{ username?: string; password?: string; tls?: unknown }>>;
}

export interface MqttTransportConnectOptions {
  readonly url: string;
  readonly protocolVersion: MqttProtocolVersion;
  readonly clientId: string;
  readonly cleanStart: boolean;
  readonly sessionExpiryIntervalSeconds?: number;
  readonly keepAliveSeconds: number;
  readonly username?: string;
  readonly password?: string;
  readonly tls?: unknown;
  readonly will?: MqttWillConfig;
}

export interface MqttConnAck {
  readonly sessionPresent: boolean;
  readonly reasonCode: number;
}

export interface MqttTransportSubscription {
  readonly topicFilter: string;
  readonly qos: MqttQos;
  readonly noLocal?: boolean;
  readonly retainAsPublished?: boolean;
  readonly retainHandling?: MqttRetainHandling;
}

export interface MqttSubscriptionAcknowledgement {
  readonly topicFilter: string;
  readonly grantedQos?: MqttQos;
  readonly reasonCode: number;
}

export interface MqttMessageProperties {
  readonly contentType?: string;
  readonly payloadFormatIndicator?: 0 | 1;
  readonly responseTopic?: string;
  readonly subscriptionIdentifier?: number | readonly number[];
  readonly userProperties?: Readonly<Record<string, string | readonly string[]>>;
}

export interface MqttTransportMessage {
  readonly topic: string;
  readonly payload: Uint8Array;
  readonly qos: MqttQos;
  readonly retain: boolean;
  readonly dup: boolean;
  readonly packetId?: number;
  readonly properties?: MqttMessageProperties;
}

export interface MqttTransportPublish {
  readonly topic: string;
  readonly payload: Uint8Array;
  readonly qos: MqttQos;
  readonly retain: boolean;
  readonly properties?: MqttMessageProperties;
}

export interface MqttPublishAcknowledgement {
  readonly qos: MqttQos;
  readonly reasonCode?: number;
  readonly packetId?: number;
}

export interface MqttTransportHandlers {
  readonly message: (message: Readonly<MqttTransportMessage>) => void;
  readonly close: (error?: unknown) => void;
  readonly error: (error: unknown) => void;
}

export interface MqttTransport {
  readonly connected: boolean;
  connect(
    options: Readonly<MqttTransportConnectOptions>,
    signal?: AbortSignal
  ): Promise<Readonly<MqttConnAck>>;
  disconnect(): Promise<void>;
  subscribe(
    subscriptions: readonly MqttTransportSubscription[],
    signal?: AbortSignal
  ): Promise<readonly MqttSubscriptionAcknowledgement[]>;
  unsubscribe(topicFilters: readonly string[]): Promise<void>;
  publish(
    message: Readonly<MqttTransportPublish>,
    signal?: AbortSignal
  ): Promise<Readonly<MqttPublishAcknowledgement>>;
  setHandlers(handlers: Readonly<MqttTransportHandlers>): void;
  clearHandlers(): void;
  dispose(): Promise<void>;
}

export interface MqttTransportFactory {
  create(): MqttTransport;
}

export interface MqttDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly timestamp: number;
  readonly endpoint: string;
  readonly topic?: string;
}

export interface MqttDataSourceConfig {
  readonly identity: DataSourceIdentity;
  readonly connection: MqttConnectionConfig;
  readonly subscriptions: readonly MqttSubscriptionDefinition[];
  readonly publish?: readonly MqttPublishMapping[];
  readonly permissions?: Readonly<{ subscribe?: boolean; publish?: boolean }>;
  readonly limits?: MqttLimits;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly scheduler?: DataSourceScheduler;
  readonly transportFactory: MqttTransportFactory;
  readonly credentialProvider?: MqttCredentialProvider;
  readonly allowedHosts?: readonly string[];
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly topicRedaction?: MqttTopicRedaction;
  readonly onDiagnostic?: (diagnostic: Readonly<MqttDiagnostic>) => void;
}

export type MqttDataSource = DataSourceAdapter;
