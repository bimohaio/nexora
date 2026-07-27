import type { ConnectionStyle, JsonValue, PropertyBinding, ScadaDocument } from "@web-scada/core";
import type { SymbolState } from "@web-scada/symbols";

export type RuntimeDataType = "boolean" | "number" | "string" | "json";
export type DataQuality = "good" | "uncertain" | "bad" | "offline" | "unknown";

export interface RuntimeValue {
  readonly tagId: string;
  readonly value: JsonValue;
  readonly dataType: RuntimeDataType;
  readonly quality: DataQuality;
  readonly timestamp: string;
  readonly source?: string;
  readonly sequence?: number;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type RuntimeQualityDetail =
  | "stale"
  | "disconnected"
  | "timeout"
  | "out-of-range"
  | "sensor-failure"
  | "communication-failure"
  | "configuration-error"
  | "manual-override"
  | "initializing"
  | "not-found"
  | "unauthorized"
  | (string & {});

export interface RuntimeDataPointInput {
  readonly key: string;
  readonly value: unknown;
  readonly quality?: DataQuality;
  readonly qualityDetail?: RuntimeQualityDetail;
  readonly timestamp?: number;
  readonly source?: string;
  readonly sequence?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RuntimeDataPoint {
  readonly key: string;
  readonly value: JsonValue;
  readonly quality: DataQuality;
  readonly qualityDetail?: RuntimeQualityDetail;
  readonly timestamp: number;
  readonly ingestionTimestamp: number;
  readonly source?: string;
  readonly sequence?: number;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type RuntimeChangeKind = "added" | "updated" | "removed";

export interface RuntimeChange {
  readonly key: string;
  readonly kind: RuntimeChangeKind;
  readonly previous?: RuntimeDataPoint;
  readonly current?: RuntimeDataPoint;
}

export interface RuntimeChangeSet {
  readonly previousRevision: number;
  readonly revision: number;
  readonly timestamp: number;
  readonly addedKeys: readonly string[];
  readonly updatedKeys: readonly string[];
  readonly removedKeys: readonly string[];
  readonly changes: readonly RuntimeChange[];
}

export interface RuntimeSnapshot {
  readonly revision: number;
  readonly timestamp: number;
  readonly size: number;
  has(key: string): boolean;
  get(key: string): RuntimeDataPoint | undefined;
  getAll(): readonly RuntimeDataPoint[];
}

export interface RuntimeStoreNotification {
  readonly snapshot: RuntimeSnapshot;
  readonly changes: RuntimeChangeSet;
}

export interface RuntimeSubscription {
  readonly closed: boolean;
  unsubscribe(): void;
}

export interface RuntimeUpdateResult {
  readonly changed: boolean;
  readonly revision: number;
  readonly changeSet?: RuntimeChangeSet;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export interface RuntimeBatchResult extends RuntimeUpdateResult {
  readonly accepted: number;
  readonly rejected: number;
}

export type RuntimeStoreListener = (notification: RuntimeStoreNotification) => void;

export type TagStoreListener = (value: RuntimeValue) => void;

export interface TagStore {
  get(tagId: string): RuntimeValue | undefined;
  getAll(): readonly RuntimeValue[];
  subscribe(listener: TagStoreListener): () => void;
}

export interface MutableTagStore extends TagStore {
  readonly revision: number;
  readonly disposed: boolean;
  set(value: RuntimeValue): boolean;
  setMany(values: readonly RuntimeValue[]): readonly RuntimeValue[];
  delete(tagId: string): boolean;
  clear(): RuntimeBatchResult;
  markQuality(tagIds: readonly string[], quality: DataQuality): readonly RuntimeValue[];
  has(key: string): boolean;
  getDataPoint(key: string): RuntimeDataPoint | undefined;
  update(input: Readonly<RuntimeDataPointInput>): RuntimeUpdateResult;
  updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult;
  remove(key: string): RuntimeUpdateResult;
  snapshot(): RuntimeSnapshot;
  subscribeChanges(listener: RuntimeStoreListener): RuntimeSubscription;
  dispose(): void;
}

export type DataProviderStatus = "connected" | "disconnected" | "error";

export interface DataProviderStatusEvent {
  readonly status: DataProviderStatus;
  readonly error?: unknown;
}

export interface DataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(tagIds: readonly string[], listener: TagStoreListener): () => void;
  subscribeStatus?(listener: (event: DataProviderStatusEvent) => void): () => void;
}

export interface BindingEvaluationRequest {
  readonly value: RuntimeValue;
  readonly targetProperty: string;
  readonly binding?: PropertyBinding;
}

export interface BindingEvaluator {
  evaluate(request: BindingEvaluationRequest): unknown;
}

export interface ResolvedNodeVisualState {
  readonly state?: SymbolState;
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly visible?: boolean;
  readonly quality: DataQuality;
}

export interface ResolvedConnectionVisualState {
  readonly style: Partial<ConnectionStyle>;
  readonly visible?: boolean;
  readonly quality: DataQuality;
}

export interface RuntimeVisualStateChange {
  readonly nodeIds: readonly string[];
  readonly connectionIds: readonly string[];
}

export interface RuntimeVisualStateReader {
  getNodeState(nodeId: string): SymbolState | undefined;
  getNodeProperties(nodeId: string): Readonly<Record<string, JsonValue>> | undefined;
  getNodeVisibility(nodeId: string): boolean | undefined;
  getNodeQuality(nodeId: string): DataQuality | undefined;
  getConnectionStyle(connectionId: string): Partial<ConnectionStyle> | undefined;
  getConnectionVisibility(connectionId: string): boolean | undefined;
  getConnectionQuality(connectionId: string): DataQuality | undefined;
}

export type RuntimeEngineStatus =
  "idle" | "connecting" | "running" | "reconnecting" | "stopped" | "disposed";

export type RuntimeDiagnosticCode =
  | "PROVIDER_CONNECT_FAILED"
  | "PROVIDER_DISCONNECTED"
  | "PROVIDER_ERROR"
  | "PROVIDER_RECONNECT_SCHEDULED"
  | "RUNTIME_VALUE_REJECTED"
  | "RUNTIME_VALUE_OUT_OF_ORDER"
  | "RUNTIME_VALUE_STALE"
  | "BINDING_SOURCE_UNSUPPORTED"
  | "BINDING_VALUE_INVALID"
  | "BINDING_EVALUATION_FAILED"
  | "RUNTIME_INVALID_KEY"
  | "RUNTIME_INVALID_VALUE"
  | "RUNTIME_INVALID_TIMESTAMP"
  | "RUNTIME_INVALID_QUALITY"
  | "RUNTIME_INVALID_SEQUENCE"
  | "RUNTIME_INVALID_SOURCE"
  | "RUNTIME_INVALID_METADATA"
  | "RUNTIME_DUPLICATE_KEY"
  | "RUNTIME_SUBSCRIBER_ERROR"
  | "RUNTIME_SCHEDULER_ERROR";

export interface RuntimeDiagnostic {
  readonly code: RuntimeDiagnosticCode;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly recoverable: boolean;
  readonly timestamp: string;
  readonly context: Readonly<Record<string, JsonValue>>;
}

export interface RuntimeEngineSnapshot {
  readonly status: RuntimeEngineStatus;
  readonly runtimeRevision: number;
  readonly runtimeSnapshotTimestamp: number;
  readonly subscribedTagIds: readonly string[];
  readonly valueCount: number;
  readonly lastUpdateAt?: string;
  readonly reconnectAttempt: number;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export type RuntimeEngineEvent =
  | {
      readonly type: "status";
      readonly status: RuntimeEngineStatus;
      readonly timestamp: string;
    }
  | {
      readonly type: "values";
      readonly values: readonly RuntimeValue[];
      readonly changedKeys: readonly string[];
      readonly runtimeRevision: number;
      readonly affected: RuntimeVisualStateChange;
      readonly timestamp: string;
    }
  | {
      readonly type: "diagnostic";
      readonly diagnostic: RuntimeDiagnostic;
      readonly timestamp: string;
    };

export type RuntimeEngineListener = (event: RuntimeEngineEvent) => void;

export interface RuntimeScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RuntimeScheduledTask {
  readonly canceled: boolean;
  cancel(): void;
}

export interface RuntimeTaskScheduler {
  readonly disposed: boolean;
  schedule(task: () => void): RuntimeScheduledTask;
  dispose(): void;
}

export interface RuntimeEngineOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly provider: DataProvider;
  readonly store?: MutableTagStore;
  readonly evaluator?: BindingEvaluator;
  readonly scheduler?: RuntimeScheduler;
  readonly reconnect?: Partial<RuntimeReconnectOptions>;
  readonly diagnosticLimit?: number;
}

export interface RuntimeReconnectOptions {
  readonly enabled: boolean;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly multiplier: number;
}

export interface RuntimeEngine {
  readonly store: MutableTagStore;
  readonly visualState: RuntimeVisualStateReader;
  update(input: Readonly<RuntimeDataPointInput>): RuntimeUpdateResult;
  updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult;
  remove(key: string): RuntimeUpdateResult;
  clear(): RuntimeBatchResult;
  getRuntimeSnapshot(): RuntimeSnapshot;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  refreshFreshness(): void;
  getStatus(): RuntimeEngineStatus;
  getSnapshot(): RuntimeEngineSnapshot;
  subscribe(listener: RuntimeEngineListener): () => void;
}
