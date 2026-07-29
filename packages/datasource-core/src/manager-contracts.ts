import type {
  DataSourceAdapter,
  DataSourceCapabilities,
  DataSourceEvent,
  DataSourceStatus,
  SubscriptionHandle,
  SubscriptionRequest
} from "./contracts.js";

export type DataSourceManagerState =
  | "created"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "degraded"
  | "disposing"
  | "disposed";
export type DataSourceHealthState =
  "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "DISABLED" | "DISPOSED";

export interface DataSourceDescriptor {
  readonly id: string;
  readonly displayName?: string;
  readonly adapterType: string;
  readonly group?: string;
  readonly enabled: boolean;
  readonly critical?: boolean;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DataSourceHealthPolicy {
  readonly enabled: boolean;
  readonly startupGraceMs?: number;
  readonly staleAfterMs?: number;
  readonly unhealthyAfterMs?: number;
  readonly maxConsecutiveErrors?: number;
  readonly degradedLatencyMs?: number;
  readonly unhealthyLatencyMs?: number;
}

export interface DataSourceRegistration {
  readonly descriptor: Readonly<DataSourceDescriptor>;
  readonly adapter: DataSourceAdapter;
  readonly healthPolicy?: Readonly<DataSourceHealthPolicy>;
  readonly dependsOn?: readonly string[];
}

export interface DataSourceFilter {
  readonly enabled?: boolean;
  readonly adapterType?: string;
  readonly group?: string;
  readonly tag?: string;
}

export interface HealthAssessment {
  readonly state: DataSourceHealthState;
  readonly evaluatedAt: number;
  readonly reasons: readonly string[];
  readonly since?: number;
}

export interface DataSourceCounters {
  readonly eventsReceived: number;
  readonly dataEventsRouted: number;
  readonly statusEvents: number;
  readonly errors: number;
  readonly connectAttempts: number;
  readonly successfulConnects: number;
  readonly failedConnects: number;
  readonly disconnects: number;
  readonly subscriptionsCreated: number;
  readonly subscriptionsRemoved: number;
  readonly listenerFailures: number;
  readonly replacements: number;
}

export interface ManagedDataSourceSnapshot {
  readonly descriptor: Readonly<DataSourceDescriptor>;
  readonly connectionStatus: Readonly<DataSourceStatus>;
  readonly health: Readonly<HealthAssessment>;
  readonly capabilities: Readonly<DataSourceCapabilities>;
  readonly generation: number;
  readonly registeredAt: number;
  readonly updatedAt: number;
  readonly activeSubscriptions: number;
}

export interface DataSourceDiagnostics extends ManagedDataSourceSnapshot {
  readonly counters: Readonly<DataSourceCounters>;
  readonly lastDataAt?: number;
  readonly lastConnectedAt?: number;
  readonly lastDisconnectedAt?: number;
  readonly lastError?: Readonly<Record<string, unknown>>;
}

export interface DataSourceManagerSnapshot {
  readonly state: DataSourceManagerState;
  readonly revision: number;
  readonly sources: readonly Readonly<ManagedDataSourceSnapshot>[];
  readonly aggregateHealth: Readonly<HealthAssessment>;
}

export interface DiagnosticsSnapshot {
  readonly exportedAt: number;
  readonly manager: Readonly<DataSourceManagerSnapshot>;
  readonly sources: readonly Readonly<DataSourceDiagnostics>[];
  readonly recentEvents: readonly Readonly<ManagerJournalEvent>[];
}

export type DataSourceOperationOutcome = "succeeded" | "failed" | "skipped" | "cancelled";
export interface DataSourceOperationResult {
  readonly sourceId: string;
  readonly outcome: DataSourceOperationOutcome;
  readonly error?: Readonly<Record<string, unknown>>;
}
export interface BulkLifecycleResult {
  readonly operation: "connect" | "disconnect" | "reconnect";
  readonly startedAt: number;
  readonly completedAt: number;
  readonly results: readonly Readonly<DataSourceOperationResult>[];
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly cancelled: number;
}
export interface BulkLifecycleOptions {
  readonly group?: string;
  readonly signal?: AbortSignal;
}

export interface ManagerEventEnvelope {
  readonly type: "DATA_SOURCE_EVENT";
  readonly timestamp: number;
  readonly revision: number;
  readonly sourceId: string;
  readonly generation: number;
  readonly managerSequence: number;
  readonly event: Readonly<DataSourceEvent>;
}
export interface ManagerStateEvent {
  readonly type:
    "REGISTERED" | "UNREGISTERED" | "REPLACED" | "ENABLED" | "DISABLED" | "MANAGER_STATE";
  readonly timestamp: number;
  readonly revision: number;
  readonly sourceId?: string;
  readonly generation?: number;
}
export type DataSourceManagerEvent = ManagerEventEnvelope | ManagerStateEvent;
export type DataSourceManagerListener = (event: Readonly<DataSourceManagerEvent>) => void;

export interface ManagerJournalEvent {
  readonly timestamp: number;
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly sourceId?: string;
  readonly summary: string;
}

export interface DataSourceManagerOptions {
  readonly now?: () => number;
  readonly historyCapacity?: number;
  readonly eventSink?: (event: Readonly<DataSourceEvent>) => void;
  readonly logger?: {
    debug?(message: string, context?: Readonly<Record<string, unknown>>): void;
    info?(message: string, context?: Readonly<Record<string, unknown>>): void;
    warn?(message: string, context?: Readonly<Record<string, unknown>>): void;
    error?(message: string, context?: Readonly<Record<string, unknown>>): void;
  };
}

export interface DataSourceManager {
  readonly state: DataSourceManagerState;
  register(registration: Readonly<DataSourceRegistration>): Promise<void>;
  unregister(id: string): Promise<void>;
  replace(id: string, registration: Readonly<DataSourceRegistration>): Promise<void>;
  connect(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  reconnect(id: string): Promise<void>;
  connectAll(options?: Readonly<BulkLifecycleOptions>): Promise<Readonly<BulkLifecycleResult>>;
  disconnectAll(options?: Readonly<BulkLifecycleOptions>): Promise<Readonly<BulkLifecycleResult>>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  subscribeSource(
    id: string,
    request: Readonly<SubscriptionRequest>
  ): Promise<Readonly<SubscriptionHandle>>;
  get(id: string): Readonly<ManagedDataSourceSnapshot> | undefined;
  list(filter?: Readonly<DataSourceFilter>): readonly Readonly<ManagedDataSourceSnapshot>[];
  getSnapshot(): Readonly<DataSourceManagerSnapshot>;
  getDiagnostics(): Readonly<DiagnosticsSnapshot>;
  subscribe(listener: DataSourceManagerListener): Readonly<{ dispose(): void }>;
  dispose(): Promise<void>;
}
