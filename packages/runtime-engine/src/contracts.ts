import type { ConnectionStyle, JsonValue, PropertyBinding, ScadaDocument } from "@web-scada/core";
import type { SymbolRegistry, SymbolState } from "@web-scada/symbols";
import type { RuntimeDiagnosticsService, RuntimeHealthStatus } from "./diagnostics.js";
import type { RuntimeLogger } from "./logging.js";
import type { RuntimeMetricsSnapshot } from "./metrics.js";
import type { RuntimeRecoveryPolicies } from "./recovery.js";

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

export type RuntimeVisualDirection = "none" | "forward" | "reverse" | "bidirectional";

export interface ResolvedSymbolVisualState extends ResolvedNodeVisualState {
  readonly symbolId: string;
  readonly revision: number;
  readonly effectiveState: SymbolState;
  readonly active: boolean;
  readonly running: boolean;
  readonly open: boolean;
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly offline: boolean;
  readonly warning: boolean;
  readonly alarm: boolean;
  readonly level?: number;
  readonly speed?: number;
  readonly flow?: number;
  readonly direction?: RuntimeVisualDirection;
  readonly text?: string;
  readonly value?: JsonValue;
  readonly overrides: Readonly<Partial<RuntimeSymbolVisualInput>>;
}

export interface RuntimeSymbolVisualInput {
  readonly sourceId?: string;
  readonly priority?: number;
  readonly timestamp?: number;
  readonly state?: unknown;
  readonly quality?: unknown;
  readonly active?: unknown;
  readonly running?: unknown;
  readonly open?: unknown;
  readonly enabled?: unknown;
  readonly disabled?: unknown;
  readonly offline?: unknown;
  readonly warning?: unknown;
  readonly alarm?: unknown;
  readonly level?: unknown;
  readonly speed?: unknown;
  readonly flow?: unknown;
  readonly direction?: unknown;
  readonly text?: unknown;
  readonly value?: unknown;
  readonly visible?: unknown;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SymbolVisualCapabilities {
  readonly supportsActive: boolean;
  readonly supportsRunning: boolean;
  readonly supportsOpen: boolean;
  readonly supportsEnabled: boolean;
  readonly supportsDisabled: boolean;
  readonly supportsOffline: boolean;
  readonly supportsWarning: boolean;
  readonly supportsAlarm: boolean;
  readonly supportsLevel: boolean;
  readonly supportsSpeed: boolean;
  readonly supportsFlow: boolean;
  readonly supportsDirection: boolean;
  readonly supportsText: boolean;
  readonly supportsValue: boolean;
  readonly supportsRotation: boolean;
  readonly supportsAnimation: boolean;
}

export interface RuntimeVisualTarget {
  readonly symbolId: string;
  readonly symbolType: string;
}

export interface ResolvedConnectionVisualState {
  readonly style: Partial<ConnectionStyle>;
  readonly visible?: boolean;
  readonly quality: DataQuality;
}

export interface RuntimeVisualSnapshot extends RuntimeVisualStateReader {
  readonly revision: number;
  readonly timestamp: number;
  readonly nodes: ReadonlyMap<string, ResolvedNodeVisualState>;
  readonly connections: ReadonlyMap<string, ResolvedConnectionVisualState>;
}

export interface RuntimeVisualSnapshotDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly addedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedConnectionIds: readonly string[];
  readonly updatedConnectionIds: readonly string[];
  readonly removedConnectionIds: readonly string[];
  readonly reset: boolean;
  readonly changedNodeProperties?: Readonly<Record<string, readonly string[]>>;
  readonly changedConnectionProperties?: Readonly<Record<string, readonly string[]>>;
}

export interface RuntimeDispatchUpdate {
  readonly symbolId: string;
  readonly properties?: Readonly<Record<string, JsonValue>>;
  readonly state?: SymbolState;
  readonly visible?: boolean;
  readonly removed?: boolean;
}

export interface RuntimeFrameDriver {
  requestFrame(callback: (timestamp: number) => void): unknown;
  cancelFrame(handle: unknown): void;
}

export interface RuntimeEventMap {
  RuntimeUpdated: {
    readonly updates: readonly RuntimeDispatchUpdate[];
    readonly timestamp: number;
  };
  SnapshotChanged: {
    readonly previousRevision: number;
    readonly revision: number;
    readonly timestamp: number;
  };
  RenderStarted: { readonly revision: number; readonly timestamp: number };
  RenderCompleted: {
    readonly revision: number;
    readonly timestamp: number;
    readonly updatedSymbols: number;
  };
  SimulationStarted: { readonly timestamp: number };
  SimulationStopped: { readonly timestamp: number };
  SubscriptionCreated: { readonly id: string; readonly timestamp: number };
  SubscriptionDisposed: { readonly id: string; readonly timestamp: number };
  RuntimeStarted: { readonly timestamp: number };
  RuntimePaused: { readonly timestamp: number };
  RuntimeResumed: { readonly timestamp: number };
  RuntimeStopped: { readonly timestamp: number };
  RuntimeDisposed: { readonly timestamp: number };
}

export type RuntimeEventType = keyof RuntimeEventMap;

export interface RuntimeEventSubscription {
  readonly closed: boolean;
  unsubscribe(): void;
}

export type RuntimeObservedChangeType = "added" | "updated" | "removed";

export interface RuntimeSubscriptionFilter {
  readonly symbolIds?: readonly string[];
  readonly properties?: readonly string[];
  readonly changeTypes?: readonly RuntimeObservedChangeType[];
}

export interface RuntimeValuesObservation {
  readonly values: readonly RuntimeValue[];
  readonly changedKeys: readonly string[];
  readonly revision: number;
  readonly timestamp: number;
}

export interface RuntimeSnapshotObservation {
  readonly previousSnapshot: RuntimeVisualSnapshot;
  readonly currentSnapshot: RuntimeVisualSnapshot;
  readonly revision: number;
  readonly timestamp: number;
  readonly symbolIds: readonly string[];
  readonly changeTypes: readonly RuntimeObservedChangeType[];
}

export interface RuntimeRevisionObservation {
  readonly previousRevision: number;
  readonly revision: number;
  readonly timestamp: number;
}

export interface RuntimeStatusObservation {
  readonly previousStatus: RuntimeEngineStatus;
  readonly status: RuntimeEngineStatus;
  readonly timestamp: number;
}

export interface RuntimeObserver {
  onRuntimeValues?(observation: RuntimeValuesObservation): void;
  onSnapshot?(observation: RuntimeSnapshotObservation): void;
  onRevision?(observation: RuntimeRevisionObservation): void;
  onStatus?(observation: RuntimeStatusObservation): void;
}

export interface SubscriptionHandle {
  readonly id: string;
  readonly active: boolean;
  readonly disposed: boolean;
  dispose(): void;
}

export interface RuntimeSubscriptionManagerApi {
  readonly disposed: boolean;
  readonly size: number;
  subscribe(observer: RuntimeObserver, filter?: RuntimeSubscriptionFilter): SubscriptionHandle;
  subscribeSymbol(symbolId: string, observer: RuntimeObserver): SubscriptionHandle;
  subscribeSymbols(symbolIds: readonly string[], observer: RuntimeObserver): SubscriptionHandle;
  subscribeSnapshot(observer: RuntimeObserver): SubscriptionHandle;
  dispose(): void;
}

export type RuntimeLifecycleStatus =
  "idle" | "starting" | "running" | "paused" | "stopping" | "stopped" | "disposed";

export interface RuntimeDisposable {
  dispose(): void | Promise<void>;
}

export interface RuntimeLifecycleHooks {
  initialize?(): void | Promise<void>;
  start?(): void | Promise<void>;
  pause?(): void | Promise<void>;
  resume?(): void | Promise<void>;
  stop?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface RuntimeVisualCommitEvent {
  readonly previousSnapshot: RuntimeVisualSnapshot;
  readonly snapshot: RuntimeVisualSnapshot;
  readonly diff: RuntimeVisualSnapshotDiff;
}

export interface RuntimeVisualStateChange {
  readonly nodeIds: readonly string[];
  readonly connectionIds: readonly string[];
}

export interface RuntimeVisualStateReader {
  getNodeVisualState?(nodeId: string): ResolvedSymbolVisualState | undefined;
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
  | "RUNTIME_SCHEDULER_ERROR"
  | "RUNTIME_VISUAL_TARGET_MISSING"
  | "RUNTIME_VISUAL_CAPABILITY_UNSUPPORTED"
  | "RUNTIME_VISUAL_PROPERTY_UNKNOWN"
  | "RUNTIME_VISUAL_VALUE_INVALID"
  | "RUNTIME_VISUAL_OVERRIDE_INVALID";

export interface RuntimeDiagnostic {
  readonly code: RuntimeDiagnosticCode;
  readonly severity: "debug" | "info" | "warning" | "error" | "fatal";
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
  readonly health?: RuntimeHealthStatus;
  readonly metrics?: RuntimeMetricsSnapshot;
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
      readonly visualCommit: RuntimeVisualCommitEvent;
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
  readonly symbols?: SymbolRegistry;
  readonly scheduler?: RuntimeScheduler;
  readonly reconnect?: Partial<RuntimeReconnectOptions>;
  readonly diagnosticLimit?: number;
  readonly diagnosticSuppressionThreshold?: number;
  readonly logger?: RuntimeLogger;
  readonly recoveryPolicies?: RuntimeRecoveryPolicies;
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
  readonly subscriptions: RuntimeSubscriptionManagerApi;
  readonly diagnostics: RuntimeDiagnosticsService;
  update(input: Readonly<RuntimeDataPointInput>): RuntimeUpdateResult;
  updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult;
  remove(key: string): RuntimeUpdateResult;
  clear(): RuntimeBatchResult;
  setVisualOverride(symbolId: string, override: RuntimeSymbolVisualInput): boolean;
  clearVisualOverride(symbolId: string): boolean;
  getRuntimeSnapshot(): RuntimeSnapshot;
  getVisualSnapshot(): RuntimeVisualSnapshot;
  flush(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  refreshFreshness(): void;
  getStatus(): RuntimeEngineStatus;
  getSnapshot(): RuntimeEngineSnapshot;
  subscribe(listener: RuntimeEngineListener): () => void;
}
