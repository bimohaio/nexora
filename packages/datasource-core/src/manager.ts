import type { DataSourceAdapter, DataSourceEvent, SubscriptionHandle } from "./contracts.js";
import { DataSourceManagerError } from "./manager-errors.js";
import type {
  BulkLifecycleOptions,
  BulkLifecycleResult,
  DataSourceCounters,
  DataSourceDescriptor,
  DataSourceDiagnostics,
  DataSourceFilter,
  DataSourceHealthPolicy,
  DataSourceManager,
  DataSourceManagerEvent,
  DataSourceManagerListener,
  DataSourceManagerOptions,
  DataSourceManagerSnapshot,
  DataSourceManagerState,
  DataSourceOperationResult,
  DataSourceRegistration,
  DiagnosticsSnapshot,
  HealthAssessment,
  ManagedDataSourceSnapshot,
  ManagerJournalEvent
} from "./manager-contracts.js";
import { redactDiagnosticValue } from "./redaction.js";

type MutableCounters = { -readonly [K in keyof DataSourceCounters]: number };
interface Entry {
  descriptor: DataSourceDescriptor;
  readonly adapter: DataSourceAdapter;
  readonly policy: DataSourceHealthPolicy;
  readonly dependsOn: readonly string[];
  generation: number;
  readonly registeredAt: number;
  updatedAt: number;
  enabled: boolean;
  acceptingEvents: boolean;
  operation: Promise<void>;
  readonly handles: Set<SubscriptionHandle>;
  readonly counters: MutableCounters;
  lastDataAt?: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastError?: Record<string, unknown>;
}

const EMPTY_COUNTERS = (): MutableCounters => ({
  eventsReceived: 0,
  dataEventsRouted: 0,
  statusEvents: 0,
  errors: 0,
  connectAttempts: 0,
  successfulConnects: 0,
  failedConnects: 0,
  disconnects: 0,
  subscriptionsCreated: 0,
  subscriptionsRemoved: 0,
  listenerFailures: 0,
  replacements: 0
});
const DEFAULT_POLICY: DataSourceHealthPolicy = Object.freeze({ enabled: true });

export function createDataSourceManager(
  options: Readonly<DataSourceManagerOptions> = {}
): DataSourceManager {
  return new Manager(options);
}

class Manager implements DataSourceManager {
  readonly #entries = new Map<string, Entry>();
  readonly #listeners = new Set<DataSourceManagerListener>();
  readonly #now: () => number;
  readonly #historyCapacity: number;
  readonly #history: ManagerJournalEvent[] = [];
  readonly #options: Readonly<DataSourceManagerOptions>;
  #state: DataSourceManagerState = "created";
  #revision = 0;
  #sequence = 0;
  #disposePromise?: Promise<void>;

  public constructor(options: Readonly<DataSourceManagerOptions>) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#historyCapacity = Math.max(0, Math.floor(options.historyCapacity ?? 100));
  }
  public get state(): DataSourceManagerState {
    return this.#state;
  }
  public async register(registration: Readonly<DataSourceRegistration>): Promise<void> {
    await Promise.resolve();
    this.#assertActive();
    const descriptor = validateDescriptor(registration.descriptor);
    if (this.#entries.has(descriptor.id))
      throw new DataSourceManagerError(
        "DATASOURCE_ALREADY_REGISTERED",
        `Data source '${descriptor.id}' is already registered.`,
        descriptor.id
      );
    validatePolicy(registration.healthPolicy);
    this.#validateDependencies(descriptor.id, registration.dependsOn ?? []);
    if (registration.adapter.identity.id !== descriptor.id)
      throw new DataSourceManagerError(
        "DATASOURCE_REGISTRATION_FAILED",
        "Descriptor and adapter identity IDs must match.",
        descriptor.id
      );
    const now = this.#now();
    this.#entries.set(descriptor.id, {
      descriptor,
      adapter: registration.adapter,
      policy: Object.freeze({ ...DEFAULT_POLICY, ...registration.healthPolicy }),
      dependsOn: Object.freeze([...(registration.dependsOn ?? [])]),
      generation: 1,
      registeredAt: now,
      updatedAt: now,
      enabled: descriptor.enabled,
      acceptingEvents: descriptor.enabled,
      operation: Promise.resolve(),
      handles: new Set(),
      counters: EMPTY_COUNTERS()
    });
    this.#emitState("REGISTERED", descriptor.id, 1);
    this.#journal("REGISTERED", "info", "Data source registered.", descriptor.id);
  }
  public async unregister(id: string): Promise<void> {
    this.#assertActive();
    const entry = this.#require(id);
    entry.acceptingEvents = false;
    ++entry.generation;
    await this.#serialize(entry, async () => {
      await this.#cleanupEntry(entry);
      this.#entries.delete(id);
    });
    this.#emitState("UNREGISTERED", id, entry.generation);
  }
  public async replace(id: string, registration: Readonly<DataSourceRegistration>): Promise<void> {
    this.#assertActive();
    const old = this.#require(id);
    const descriptor = validateDescriptor(registration.descriptor);
    if (descriptor.id !== id || registration.adapter.identity.id !== id)
      throw new DataSourceManagerError(
        "DATASOURCE_REPLACEMENT_FAILED",
        "Replacement IDs must match the registered source.",
        id
      );
    validatePolicy(registration.healthPolicy);
    this.#validateDependencies(id, registration.dependsOn ?? [], true);
    const wasConnected = old.adapter.getStatus().state === "connected";
    if (wasConnected && descriptor.enabled) {
      try {
        await registration.adapter.connect();
      } catch (cause) {
        await registration.adapter.dispose().catch(() => undefined);
        throw new DataSourceManagerError(
          "DATASOURCE_REPLACEMENT_FAILED",
          "Replacement adapter could not connect; the existing adapter remains active.",
          id,
          { cause }
        );
      }
    }
    const now = this.#now();
    const replacement: Entry = {
      descriptor,
      adapter: registration.adapter,
      policy: Object.freeze({ ...DEFAULT_POLICY, ...registration.healthPolicy }),
      dependsOn: Object.freeze([...(registration.dependsOn ?? [])]),
      generation: old.generation + 1,
      registeredAt: old.registeredAt,
      updatedAt: now,
      enabled: descriptor.enabled,
      acceptingEvents: descriptor.enabled,
      operation: Promise.resolve(),
      handles: new Set(),
      counters: { ...old.counters, replacements: old.counters.replacements + 1 }
    };
    old.acceptingEvents = false;
    this.#entries.set(id, replacement);
    await this.#cleanupEntry(old);
    this.#emitState("REPLACED", id, replacement.generation);
  }
  public connect(id: string): Promise<void> {
    this.#assertActive();
    const entry = this.#require(id);
    if (!entry.enabled) return Promise.resolve();
    return this.#serialize(entry, async () => {
      if (entry.adapter.getStatus().state === "connected") return;
      ++entry.counters.connectAttempts;
      const started = this.#now();
      try {
        await entry.adapter.connect();
        ++entry.counters.successfulConnects;
        entry.lastConnectedAt = this.#now();
        entry.updatedAt = this.#now();
        this.#journal("CONNECTED", "info", `Connected in ${this.#now() - started}ms.`, id);
      } catch (error) {
        ++entry.counters.failedConnects;
        entry.lastError = sanitizeError(error);
        this.#journal("CONNECT_FAILED", "error", "Connection failed.", id);
        throw error;
      }
    });
  }
  public disconnect(id: string): Promise<void> {
    this.#assertActive();
    const entry = this.#require(id);
    return this.#serialize(entry, async () => {
      const state = entry.adapter.getStatus().state;
      if (state === "disconnected" || state === "idle" || state === "disposed") return;
      await entry.adapter.disconnect();
      ++entry.counters.disconnects;
      entry.lastDisconnectedAt = this.#now();
      entry.updatedAt = this.#now();
    });
  }
  public async reconnect(id: string): Promise<void> {
    await this.disconnect(id);
    await this.connect(id);
  }
  public connectAll(
    options?: Readonly<BulkLifecycleOptions>
  ): Promise<Readonly<BulkLifecycleResult>> {
    this.#state = "starting";
    return this.#bulk("connect", options).then((result) => {
      this.#state = result.failed === 0 ? "running" : "degraded";
      return result;
    });
  }
  public disconnectAll(
    options?: Readonly<BulkLifecycleOptions>
  ): Promise<Readonly<BulkLifecycleResult>> {
    this.#state = "stopping";
    return this.#bulk("disconnect", options).then((result) => {
      if (this.#state !== "disposing") this.#state = "stopped";
      return result;
    });
  }
  public async enable(id: string): Promise<void> {
    await Promise.resolve();
    this.#assertActive();
    const entry = this.#require(id);
    entry.enabled = true;
    entry.acceptingEvents = true;
    entry.descriptor = Object.freeze({ ...entry.descriptor, enabled: true });
    entry.updatedAt = this.#now();
    this.#emitState("ENABLED", id, entry.generation);
  }
  public async disable(id: string): Promise<void> {
    this.#assertActive();
    const entry = this.#require(id);
    entry.enabled = false;
    entry.acceptingEvents = false;
    entry.descriptor = Object.freeze({ ...entry.descriptor, enabled: false });
    await this.disconnect(id);
    this.#emitState("DISABLED", id, entry.generation);
  }
  public async subscribeSource(
    id: string,
    request: Parameters<DataSourceAdapter["subscribe"]>[0]
  ): Promise<Readonly<SubscriptionHandle>> {
    this.#assertActive();
    const entry = this.#require(id);
    const generation = entry.generation;
    const inner = await entry.adapter.subscribe(request, (event) => {
      this.#route(entry, generation, event);
    });
    if (!entry.acceptingEvents || entry.generation !== generation) {
      await inner.unsubscribe();
      throw new DataSourceManagerError("DATASOURCE_NOT_FOUND", "Data source changed.", id);
    }
    entry.handles.add(inner);
    ++entry.counters.subscriptionsCreated;
    let closed = false;
    return Object.freeze({
      id: inner.id,
      get closed() {
        return closed || inner.closed;
      },
      unsubscribe: async () => {
        if (closed) return;
        closed = true;
        entry.handles.delete(inner);
        ++entry.counters.subscriptionsRemoved;
        await inner.unsubscribe();
      }
    });
  }
  public get(id: string): Readonly<ManagedDataSourceSnapshot> | undefined {
    const entry = this.#entries.get(id);
    return entry && this.#snapshot(entry);
  }
  public list(filter: Readonly<DataSourceFilter> = {}): readonly ManagedDataSourceSnapshot[] {
    return [...this.#entries.values()]
      .filter(
        (entry) =>
          (filter.enabled === undefined || entry.enabled === filter.enabled) &&
          (filter.adapterType === undefined ||
            entry.descriptor.adapterType === filter.adapterType) &&
          (filter.group === undefined || entry.descriptor.group === filter.group) &&
          (filter.tag === undefined || entry.descriptor.tags?.includes(filter.tag) === true)
      )
      .map((entry) => this.#snapshot(entry));
  }
  public getSnapshot(): Readonly<DataSourceManagerSnapshot> {
    const sources = this.list();
    return Object.freeze({
      state: this.#state,
      revision: this.#revision,
      sources,
      aggregateHealth: aggregateHealth(sources, this.#now())
    });
  }
  public getDiagnostics(): Readonly<DiagnosticsSnapshot> {
    const sources: DataSourceDiagnostics[] = [...this.#entries.values()].map((entry) =>
      Object.freeze({
        ...this.#snapshot(entry),
        counters: Object.freeze({ ...entry.counters }),
        ...(entry.lastDataAt === undefined ? {} : { lastDataAt: entry.lastDataAt }),
        ...(entry.lastConnectedAt === undefined ? {} : { lastConnectedAt: entry.lastConnectedAt }),
        ...(entry.lastDisconnectedAt === undefined
          ? {}
          : { lastDisconnectedAt: entry.lastDisconnectedAt }),
        ...(entry.lastError === undefined ? {} : { lastError: entry.lastError })
      })
    );
    return Object.freeze({
      exportedAt: this.#now(),
      manager: this.getSnapshot(),
      sources: Object.freeze(sources),
      recentEvents: Object.freeze(this.#history.map((event) => Object.freeze({ ...event })))
    });
  }
  public subscribe(listener: DataSourceManagerListener): Readonly<{ dispose(): void }> {
    this.#assertActive();
    this.#listeners.add(listener);
    return Object.freeze({
      dispose: () => {
        this.#listeners.delete(listener);
      }
    });
  }
  public dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    this.#state = "disposing";
    this.#disposePromise = (async () => {
      const entries = [...this.#entries.values()].reverse();
      for (const entry of entries) {
        entry.acceptingEvents = false;
        await this.#serialize(entry, () => this.#cleanupEntry(entry)).catch((error: unknown) => {
          this.#log("error", "Data source cleanup failed.", {
            sourceId: entry.descriptor.id,
            error: sanitizeError(error)
          });
        });
      }
      this.#entries.clear();
      this.#listeners.clear();
      this.#state = "disposed";
      ++this.#revision;
    })();
    return this.#disposePromise;
  }
  async #bulk(
    operation: "connect" | "disconnect" | "reconnect",
    options: Readonly<BulkLifecycleOptions> = {}
  ): Promise<BulkLifecycleResult> {
    this.#assertActive();
    const startedAt = this.#now();
    const entries = this.#orderedEntries(operation === "disconnect").filter(
      (entry) => options.group === undefined || entry.descriptor.group === options.group
    );
    const results: DataSourceOperationResult[] = [];
    for (const entry of entries) {
      if (options.signal?.aborted) {
        results.push({ sourceId: entry.descriptor.id, outcome: "cancelled" });
        continue;
      }
      if (!entry.enabled && operation !== "disconnect") {
        results.push({ sourceId: entry.descriptor.id, outcome: "skipped" });
        continue;
      }
      try {
        await this[operation](entry.descriptor.id);
        results.push({ sourceId: entry.descriptor.id, outcome: "succeeded" });
      } catch (error) {
        results.push({
          sourceId: entry.descriptor.id,
          outcome: "failed",
          error: sanitizeError(error)
        });
      }
    }
    const count = (outcome: DataSourceOperationResult["outcome"]): number =>
      results.filter((result) => result.outcome === outcome).length;
    return Object.freeze({
      operation,
      startedAt,
      completedAt: this.#now(),
      results: Object.freeze(results),
      succeeded: count("succeeded"),
      failed: count("failed"),
      skipped: count("skipped"),
      cancelled: count("cancelled")
    });
  }
  #orderedEntries(reverse: boolean): Entry[] {
    const ordered: Entry[] = [];
    const visited = new Set<string>();
    const visit = (entry: Entry): void => {
      if (visited.has(entry.descriptor.id)) return;
      visited.add(entry.descriptor.id);
      for (const dependency of entry.dependsOn) visit(this.#require(dependency));
      ordered.push(entry);
    };
    for (const entry of this.#entries.values()) visit(entry);
    return reverse ? ordered.reverse() : ordered;
  }
  #route(entry: Entry, generation: number, event: Readonly<DataSourceEvent>): void {
    if (
      !entry.acceptingEvents ||
      entry.generation !== generation ||
      this.#entries.get(entry.descriptor.id) !== entry
    )
      return;
    ++entry.counters.eventsReceived;
    if (event.type === "VALUE") {
      ++entry.counters.dataEventsRouted;
      entry.lastDataAt = this.#now();
    } else if (event.type === "STATUS") ++entry.counters.statusEvents;
    else if (event.type === "ERROR") {
      ++entry.counters.errors;
      entry.lastError = sanitizeError(event.error);
    }
    const envelope = Object.freeze({
      type: "DATA_SOURCE_EVENT" as const,
      timestamp: this.#now(),
      revision: ++this.#revision,
      sourceId: entry.descriptor.id,
      generation,
      managerSequence: ++this.#sequence,
      event
    });
    try {
      this.#options.eventSink?.(event);
    } catch (error) {
      ++entry.counters.listenerFailures;
      this.#log("error", "Runtime event sink failed.", { sourceId: entry.descriptor.id, error });
    }
    this.#notify(envelope, entry);
  }
  #notify(event: Readonly<DataSourceManagerEvent>, entry?: Entry): void {
    for (const listener of [...this.#listeners])
      try {
        listener(event);
      } catch (error) {
        if (entry) ++entry.counters.listenerFailures;
        this.#log("warn", "Data source manager listener failed.", { error });
      }
  }
  #emitState(
    type: Extract<DataSourceManagerEvent, { type: string }>["type"],
    sourceId?: string,
    generation?: number
  ): void {
    const event = Object.freeze({
      type: type as
        "REGISTERED" | "UNREGISTERED" | "REPLACED" | "ENABLED" | "DISABLED" | "MANAGER_STATE",
      timestamp: this.#now(),
      revision: ++this.#revision,
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(generation === undefined ? {} : { generation })
    });
    this.#notify(event);
  }
  #snapshot(entry: Entry): ManagedDataSourceSnapshot {
    const status = Object.freeze({ ...entry.adapter.getStatus() });
    return Object.freeze({
      descriptor: Object.freeze({
        ...entry.descriptor,
        tags: Object.freeze([...(entry.descriptor.tags ?? [])])
      }),
      connectionStatus: status,
      health: assessHealth(entry, status, this.#now()),
      capabilities: Object.freeze({ ...entry.adapter.capabilities }),
      generation: entry.generation,
      registeredAt: entry.registeredAt,
      updatedAt: entry.updatedAt,
      activeSubscriptions: entry.handles.size
    });
  }
  #serialize(entry: Entry, action: () => Promise<void>): Promise<void> {
    const result = entry.operation.then(action, action);
    entry.operation = result.catch(() => undefined);
    return result;
  }
  async #cleanupEntry(entry: Entry): Promise<void> {
    for (const handle of [...entry.handles]) {
      entry.handles.delete(handle);
      await Promise.resolve(handle.unsubscribe()).catch(() => undefined);
      ++entry.counters.subscriptionsRemoved;
    }
    const state = entry.adapter.getStatus().state;
    if (!["idle", "disconnected", "disposed"].includes(state))
      await entry.adapter.disconnect().catch((error: unknown) => {
        this.#log("warn", "Data source disconnect failed during cleanup.", { error });
      });
    await entry.adapter.dispose();
  }
  #require(id: string): Entry {
    const entry = this.#entries.get(id);
    if (!entry)
      throw new DataSourceManagerError(
        "DATASOURCE_NOT_FOUND",
        `Data source '${id}' is not registered.`,
        id
      );
    return entry;
  }
  #assertActive(): void {
    if (this.#state === "disposing" || this.#state === "disposed")
      throw new DataSourceManagerError(
        "DATASOURCE_MANAGER_DISPOSED",
        "Data source manager is disposed."
      );
  }
  #validateDependencies(id: string, dependencies: readonly string[], replacing = false): void {
    for (const dependency of dependencies)
      if (
        dependency === id ||
        (!this.#entries.has(dependency) && !(replacing && dependency === id))
      )
        throw new DataSourceManagerError(
          dependency === id ? "DATASOURCE_DEPENDENCY_CYCLE" : "DATASOURCE_DEPENDENCY_MISSING",
          dependency === id
            ? "A data source cannot depend on itself."
            : `Dependency '${dependency}' is not registered.`,
          id
        );
  }
  #journal(
    code: string,
    severity: ManagerJournalEvent["severity"],
    summary: string,
    sourceId?: string
  ): void {
    if (this.#historyCapacity === 0) return;
    this.#history.push(
      Object.freeze({
        timestamp: this.#now(),
        code,
        severity,
        summary,
        ...(sourceId ? { sourceId } : {})
      })
    );
    while (this.#history.length > this.#historyCapacity) this.#history.shift();
  }
  #log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context: Record<string, unknown>
  ): void {
    this.#options.logger?.[level]?.(
      message,
      redactDiagnosticValue(context) as Record<string, unknown>
    );
  }
}

function validateDescriptor(descriptor: Readonly<DataSourceDescriptor>): DataSourceDescriptor {
  const id = descriptor.id.trim();
  if (id === "" || id.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))
    throw new DataSourceManagerError(
      "DATASOURCE_REGISTRATION_FAILED",
      "Data source ID must be a non-empty, log-safe identifier."
    );
  if (descriptor.adapterType.trim() === "")
    throw new DataSourceManagerError(
      "DATASOURCE_REGISTRATION_FAILED",
      "Adapter type must not be empty.",
      id
    );
  return Object.freeze({ ...descriptor, id, tags: Object.freeze([...(descriptor.tags ?? [])]) });
}
function validatePolicy(policy?: Readonly<DataSourceHealthPolicy>): void {
  if (!policy) return;
  for (const [name, value] of Object.entries(policy))
    if (name !== "enabled" && typeof value === "number" && (!Number.isFinite(value) || value < 0))
      throw new DataSourceManagerError(
        "DATASOURCE_HEALTH_POLICY_INVALID",
        `${name} must be a finite non-negative number.`
      );
  if (
    policy.staleAfterMs !== undefined &&
    policy.unhealthyAfterMs !== undefined &&
    policy.unhealthyAfterMs < policy.staleAfterMs
  )
    throw new DataSourceManagerError(
      "DATASOURCE_HEALTH_POLICY_INVALID",
      "unhealthyAfterMs must not be lower than staleAfterMs."
    );
}
function assessHealth(
  entry: Entry,
  status: ReturnType<DataSourceAdapter["getStatus"]>,
  now: number
): HealthAssessment {
  let state: HealthAssessment["state"] = "UNKNOWN";
  let reasons: string[] = ["NO_HEALTH_SIGNAL"];
  if (status.state === "disposed") [state, reasons] = ["DISPOSED", ["ADAPTER_DISPOSED"]];
  else if (!entry.enabled || !entry.policy.enabled)
    [state, reasons] = ["DISABLED", ["SOURCE_DISABLED"]];
  else if (status.state === "failed" || status.state === "disconnected")
    [state, reasons] = ["UNHEALTHY", ["UNEXPECTED_DISCONNECT"]];
  else if (status.state === "reconnecting" || status.state === "connecting")
    [state, reasons] = ["DEGRADED", ["CONNECTION_TRANSITION"]];
  else if (status.state === "connected") {
    const age = entry.lastDataAt === undefined ? undefined : now - entry.lastDataAt;
    if (
      entry.policy.unhealthyAfterMs !== undefined &&
      age !== undefined &&
      age >= entry.policy.unhealthyAfterMs
    )
      [state, reasons] = ["UNHEALTHY", ["DATA_UNHEALTHY_STALE"]];
    else if (
      entry.policy.staleAfterMs !== undefined &&
      age !== undefined &&
      age >= entry.policy.staleAfterMs
    )
      [state, reasons] = ["DEGRADED", ["DATA_STALE"]];
    else [state, reasons] = ["HEALTHY", ["CONNECTED"]];
  }
  return Object.freeze({ state, evaluatedAt: now, reasons: Object.freeze(reasons) });
}
function aggregateHealth(
  sources: readonly ManagedDataSourceSnapshot[],
  now: number
): HealthAssessment {
  const enabled = sources.filter((source) => source.descriptor.enabled);
  let state: HealthAssessment["state"] = "UNKNOWN";
  let reasons = ["NO_ENABLED_SOURCES"];
  if (enabled.some((source) => source.descriptor.critical && source.health.state === "UNHEALTHY"))
    [state, reasons] = ["UNHEALTHY", ["CRITICAL_SOURCE_UNHEALTHY"]];
  else if (enabled.some((source) => ["DEGRADED", "UNHEALTHY"].includes(source.health.state)))
    [state, reasons] = ["DEGRADED", ["SOURCE_NOT_HEALTHY"]];
  else if (enabled.length > 0 && enabled.every((source) => source.health.state === "HEALTHY"))
    [state, reasons] = ["HEALTHY", ["ALL_ENABLED_SOURCES_HEALTHY"]];
  return Object.freeze({ state, evaluatedAt: now, reasons: Object.freeze(reasons) });
}
function sanitizeError(error: unknown): Record<string, unknown> {
  const raw =
    error instanceof Error
      ? { name: error.name, message: error.message, cause: error.cause }
      : { message: String(error) };
  return redactDiagnosticValue(raw) as Record<string, unknown>;
}
