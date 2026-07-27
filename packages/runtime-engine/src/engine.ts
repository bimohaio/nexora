import type { JsonValue } from "@web-scada/core";
import {
  type DataProviderStatusEvent,
  type RuntimeDiagnostic,
  type RuntimeDiagnosticCode,
  type RuntimeEngine,
  type RuntimeEngineEvent,
  type RuntimeEngineListener,
  type RuntimeEngineOptions,
  type RuntimeEngineSnapshot,
  type RuntimeEngineStatus,
  type RuntimeDataPointInput,
  type RuntimeBatchResult,
  type RuntimeReconnectOptions,
  type RuntimeScheduler,
  type RuntimeSnapshot,
  type RuntimeSymbolVisualInput,
  type RuntimeSubscription,
  type RuntimeUpdateResult,
  type RuntimeValue,
  type RuntimeVisualSnapshot
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import { RuntimeDiagnosticsService } from "./diagnostics.js";
import { RuntimeMetrics } from "./metrics.js";
import { PassthroughBindingEvaluator } from "./evaluator.js";
import { InMemoryTagStore } from "./store.js";
import { RuntimeSubscriptionManager, statusObservation } from "./subscriptions.js";
import { RuntimeVisualStateResolver } from "./visual-state.js";
import { RuntimeVisualSnapshotRepository } from "./visual-snapshot.js";

const DEFAULT_RECONNECT: RuntimeReconnectOptions = {
  enabled: true,
  initialDelayMs: 500,
  maximumDelayMs: 30_000,
  multiplier: 2
};
const DEFAULT_DIAGNOSTIC_LIMIT = 100;
const SYSTEM_SCHEDULER: RuntimeScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

function validateOptions(options: RuntimeEngineOptions, reconnect: RuntimeReconnectOptions): void {
  const { refreshInterval, staleAfterMs } = options.document.runtimeSettings;
  if (
    !Number.isFinite(refreshInterval) ||
    refreshInterval <= 0 ||
    (staleAfterMs !== undefined && (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0)) ||
    !Number.isFinite(reconnect.initialDelayMs) ||
    reconnect.initialDelayMs < 0 ||
    !Number.isFinite(reconnect.maximumDelayMs) ||
    reconnect.maximumDelayMs < reconnect.initialDelayMs ||
    !Number.isFinite(reconnect.multiplier) ||
    reconnect.multiplier < 1
  )
    throw new RuntimeEngineError(
      "RUNTIME_CONFIGURATION_INVALID",
      "Runtime Engine configuration is invalid."
    );
}

function diagnosticContext(
  values: Readonly<Record<string, string | number | boolean | undefined>>
): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined;
    })
  );
}

export class ProviderRuntimeEngine implements RuntimeEngine {
  public readonly store;
  public readonly visualState;
  public readonly subscriptions;
  public readonly diagnostics;
  readonly #options: RuntimeEngineOptions;
  readonly #scheduler: RuntimeScheduler;
  readonly #reconnect: RuntimeReconnectOptions;
  readonly #diagnosticLimit: number;
  readonly #listeners = new Set<RuntimeEngineListener>();
  readonly #diagnostics: RuntimeDiagnostic[] = [];
  readonly #subscribedTagIds: readonly string[];
  readonly #pendingValues = new Map<string, RuntimeValue>();
  readonly #pendingTagIds = new Set<string>();
  readonly #storeSubscription: RuntimeSubscription;
  readonly #ownsStore: boolean;
  readonly #visualSnapshots: RuntimeVisualSnapshotRepository;
  readonly #metrics = new RuntimeMetrics();
  #unsubscribeProvider: (() => void) | undefined;
  #unsubscribeProviderStatus: (() => void) | undefined;
  #flushTimer: unknown;
  #freshnessTimer: unknown;
  #reconnectTimer: unknown;
  #status: RuntimeEngineStatus = "idle";
  #reconnectAttempt = 0;
  #lastUpdateAt: string | undefined;
  #generation = 0;
  #startPromise: Promise<void> | undefined;
  #pendingReset = false;

  public constructor(options: RuntimeEngineOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? SYSTEM_SCHEDULER;
    this.subscriptions = new RuntimeSubscriptionManager({
      now: () => this.#scheduler.now()
    });
    this.#reconnect = { ...DEFAULT_RECONNECT, ...options.reconnect };
    this.#diagnosticLimit = options.diagnosticLimit ?? DEFAULT_DIAGNOSTIC_LIMIT;
    this.diagnostics = new RuntimeDiagnosticsService({
      limit: this.#diagnosticLimit,
      ...(options.diagnosticSuppressionThreshold === undefined
        ? {}
        : { suppressionThreshold: options.diagnosticSuppressionThreshold }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      metrics: this.#metrics
    });
    validateOptions(options, this.#reconnect);
    if (!Number.isInteger(this.#diagnosticLimit) || this.#diagnosticLimit < 1)
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Diagnostic limit must be a positive integer."
      );
    this.#ownsStore = options.store === undefined;
    this.store =
      options.store ??
      new InMemoryTagStore({
        now: () => this.#scheduler.now(),
        defaultQuality: options.document.runtimeSettings.defaultQuality,
        onDiagnostic: (entry) => {
          this.#recordDiagnostic(entry);
        }
      });
    this.#subscribedTagIds = [
      ...new Set(
        options.document.bindings.flatMap((binding) =>
          binding.enabled && binding.source.type === "tag" ? [binding.source.tagId] : []
        )
      )
    ].sort();
    this.visualState = new RuntimeVisualStateResolver({
      document: options.document,
      store: this.store,
      evaluator: options.evaluator ?? new PassthroughBindingEvaluator(),
      ...(options.symbols === undefined ? {} : { symbols: options.symbols }),
      now: () => this.#scheduler.now(),
      onDiagnostic: (code, message, bindingId) => {
        this.#diagnostic(code, "warning", message, { bindingId });
      }
    });
    this.#visualSnapshots = new RuntimeVisualSnapshotRepository(
      options.document,
      this.visualState,
      () => this.#scheduler.now()
    );
    this.#storeSubscription = this.store.subscribeChanges(({ changes }) => {
      for (const change of changes.changes) {
        this.#pendingTagIds.add(change.key);
        const value = this.store.get(change.key);
        if (value === undefined) this.#pendingValues.delete(change.key);
        else this.#pendingValues.set(change.key, value);
      }
      this.#lastUpdateAt = new Date(this.#scheduler.now()).toISOString();
      this.#scheduleFlush();
    });
  }

  public async start(): Promise<void> {
    this.#assertUsable();
    if (this.#status === "running") return;
    if (this.#startPromise !== undefined) return this.#startPromise;
    const generation = ++this.#generation;
    this.#clearReconnectTimer();
    this.#setStatus(this.#reconnectAttempt === 0 ? "connecting" : "reconnecting");
    const start = this.#connect(generation).finally(() => {
      if (this.#startPromise === start) this.#startPromise = undefined;
    });
    this.#startPromise = start;
    return start;
  }

  public update(input: Readonly<RuntimeDataPointInput>): RuntimeUpdateResult {
    this.#assertUsable();
    const result = this.store.update(input);
    this.#metrics.recordUpdate(result.diagnostics.length > 0);
    return result;
  }

  public updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult {
    this.#assertUsable();
    const result = this.store.updateMany(inputs);
    for (let index = 0; index < result.accepted; index += 1) this.#metrics.recordUpdate();
    for (let index = 0; index < result.rejected; index += 1) this.#metrics.recordUpdate(true);
    return result;
  }

  public remove(key: string): RuntimeUpdateResult {
    this.#assertUsable();
    return this.store.remove(key);
  }

  public clear(): RuntimeBatchResult {
    this.#assertUsable();
    this.#pendingReset = true;
    return this.store.clear();
  }

  public setVisualOverride(symbolId: string, override: RuntimeSymbolVisualInput): boolean {
    this.#assertUsable();
    const changed = this.visualState.setNodeOverride(symbolId, override);
    if (changed) this.#publishVisualOverride(symbolId);
    return changed;
  }

  public clearVisualOverride(symbolId: string): boolean {
    this.#assertUsable();
    const changed = this.visualState.clearNodeOverride(symbolId);
    if (changed) this.#publishVisualOverride(symbolId);
    return changed;
  }

  public getRuntimeSnapshot(): RuntimeSnapshot {
    return this.store.snapshot();
  }

  public getVisualSnapshot(): RuntimeVisualSnapshot {
    return this.#visualSnapshots.snapshot;
  }

  public flush(): void {
    this.#assertUsable();
    this.#flushNow();
  }

  public async stop(): Promise<void> {
    if (this.#status === "disposed" || this.#status === "stopped") return;
    ++this.#generation;
    this.#startPromise = undefined;
    this.#clearReconnectTimer();
    this.#clearFreshnessTimer();
    this.#unsubscribeFromProvider();
    try {
      await this.#options.provider.disconnect();
    } catch {
      this.#diagnostic("PROVIDER_ERROR", "warning", "Provider disconnect failed.", {});
    }
    this.store.markQuality(this.#subscribedTagIds, "offline");
    this.#flushNow();
    this.#setStatus("stopped");
  }

  public async dispose(): Promise<void> {
    if (this.#status === "disposed") return;
    await this.stop();
    this.#clearFlushTimer();
    this.#storeSubscription.unsubscribe();
    if (this.#ownsStore) this.store.dispose();
    this.#setStatus("disposed");
    this.subscriptions.dispose();
    this.#listeners.clear();
  }

  public refreshFreshness(): void {
    this.#assertUsable();
    const staleAfterMs = this.#options.document.runtimeSettings.staleAfterMs;
    if (staleAfterMs === undefined) return;
    const now = this.#scheduler.now();
    const staleIds = this.store
      .getAll()
      .filter(
        (value) =>
          ["good", "unknown"].includes(value.quality) &&
          now - Date.parse(value.timestamp) > staleAfterMs
      )
      .map(({ tagId }) => tagId);
    if (staleIds.length === 0) return;
    this.store.markQuality(staleIds, "uncertain");
    for (const tagId of staleIds)
      this.#diagnostic("RUNTIME_VALUE_STALE", "warning", "Runtime value became stale.", {
        tagId
      });
  }

  public getStatus(): RuntimeEngineStatus {
    return this.#status;
  }

  public getSnapshot(): RuntimeEngineSnapshot {
    const runtimeSnapshot = this.store.snapshot();
    const base = {
      status: this.#status,
      runtimeRevision: runtimeSnapshot.revision,
      runtimeSnapshotTimestamp: runtimeSnapshot.timestamp,
      subscribedTagIds: [...this.#subscribedTagIds],
      valueCount: this.store.getAll().length,
      reconnectAttempt: this.#reconnectAttempt,
      diagnostics: this.#diagnostics.map((diagnostic) => ({
        ...diagnostic,
        context: { ...diagnostic.context }
      })),
      health: this.diagnostics.getHealth(),
      metrics: this.#metrics.snapshot(this.subscriptions.size)
    };
    return this.#lastUpdateAt === undefined ? base : { ...base, lastUpdateAt: this.#lastUpdateAt };
  }

  public subscribe(listener: RuntimeEngineListener): () => void {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async #connect(generation: number): Promise<void> {
    try {
      await this.#options.provider.connect();
      if (generation !== this.#generation || this.#status === "disposed") return;
      this.#unsubscribeProvider = this.#options.provider.subscribe(
        this.#subscribedTagIds,
        (value) => {
          this.#acceptProviderValue(value);
        }
      );
      this.#unsubscribeProviderStatus = this.#options.provider.subscribeStatus?.((event) => {
        this.#handleProviderStatus(event);
      });
      this.#reconnectAttempt = 0;
      this.#setStatus("running");
      this.#scheduleFreshnessCheck();
    } catch {
      if (generation !== this.#generation || this.#status === "disposed") return;
      this.#diagnostic("PROVIDER_CONNECT_FAILED", "error", "Provider connection failed.", {
        attempt: this.#reconnectAttempt + 1
      });
      this.#scheduleReconnect();
    }
  }

  #acceptProviderValue(value: RuntimeValue): void {
    const current = this.store.get(value.tagId);
    if (
      current !== undefined &&
      Number.isFinite(Date.parse(value.timestamp)) &&
      Date.parse(value.timestamp) < Date.parse(current.timestamp)
    ) {
      this.#diagnostic(
        "RUNTIME_VALUE_OUT_OF_ORDER",
        "warning",
        "Out-of-order runtime value was ignored.",
        { tagId: value.tagId }
      );
      return;
    }
    try {
      this.store.set(value);
    } catch {
      this.#diagnostic("RUNTIME_VALUE_REJECTED", "warning", "Invalid runtime value was rejected.", {
        tagId: value.tagId
      });
    }
  }

  #handleProviderStatus(event: DataProviderStatusEvent): void {
    if (event.status === "connected" || this.#status === "disposed") return;
    this.#diagnostic(
      event.status === "error" ? "PROVIDER_ERROR" : "PROVIDER_DISCONNECTED",
      event.status === "error" ? "error" : "warning",
      event.status === "error" ? "Provider reported an error." : "Provider disconnected.",
      {}
    );
    this.#unsubscribeFromProvider();
    this.store.markQuality(this.#subscribedTagIds, "offline");
    this.#flushNow();
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (!this.#reconnect.enabled || this.#status === "disposed" || this.#status === "stopped") {
      this.#setStatus("stopped");
      return;
    }
    this.#reconnectAttempt += 1;
    this.#setStatus("reconnecting");
    const delay = Math.min(
      this.#reconnect.maximumDelayMs,
      this.#reconnect.initialDelayMs *
        this.#reconnect.multiplier ** Math.max(0, this.#reconnectAttempt - 1)
    );
    this.#diagnostic("PROVIDER_RECONNECT_SCHEDULED", "info", "Provider reconnect was scheduled.", {
      attempt: this.#reconnectAttempt,
      delayMs: delay
    });
    this.#clearReconnectTimer();
    this.#reconnectTimer = this.#scheduler.setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.start();
    }, delay);
  }

  #scheduleFlush(): void {
    if (this.#flushTimer !== undefined) return;
    this.#flushTimer = this.#scheduler.setTimeout(() => {
      this.#flushTimer = undefined;
      this.#flushNow();
    }, this.#options.document.runtimeSettings.refreshInterval);
  }

  #flushNow(): void {
    this.#clearFlushTimer();
    if (this.#pendingTagIds.size === 0) return;
    const values = [...this.#pendingValues.values()].sort((left, right) =>
      left.tagId.localeCompare(right.tagId)
    );
    const tagIds = [...this.#pendingTagIds].sort();
    this.#pendingValues.clear();
    this.#pendingTagIds.clear();
    const affected = this.visualState.refresh(tagIds);
    const visualCommit = this.#visualSnapshots.commit(affected, this.#pendingReset);
    this.#pendingReset = false;
    if (visualCommit === undefined) return;
    this.#emit({
      type: "values",
      values,
      changedKeys: tagIds,
      runtimeRevision: this.store.revision,
      affected,
      visualCommit,
      timestamp: new Date(this.#scheduler.now()).toISOString()
    });
  }

  #scheduleFreshnessCheck(): void {
    this.#clearFreshnessTimer();
    const staleAfterMs = this.#options.document.runtimeSettings.staleAfterMs;
    if (staleAfterMs === undefined || this.#status !== "running") return;
    const delay = Math.max(
      1,
      Math.min(staleAfterMs, this.#options.document.runtimeSettings.refreshInterval)
    );
    this.#freshnessTimer = this.#scheduler.setTimeout(() => {
      this.#freshnessTimer = undefined;
      this.refreshFreshness();
      this.#scheduleFreshnessCheck();
    }, delay);
  }

  #publishVisualOverride(symbolId: string): void {
    const affected = { nodeIds: [symbolId], connectionIds: [] };
    const visualCommit = this.#visualSnapshots.commit(affected);
    if (visualCommit === undefined) return;
    this.#emit({
      type: "values",
      values: Object.freeze([]),
      changedKeys: Object.freeze([]),
      runtimeRevision: this.store.revision,
      affected,
      visualCommit,
      timestamp: new Date(this.#scheduler.now()).toISOString()
    });
  }

  #diagnostic(
    code: RuntimeDiagnosticCode,
    severity: RuntimeDiagnostic["severity"],
    message: string,
    context: Readonly<Record<string, string | number | boolean | undefined>>
  ): void {
    const diagnostic: RuntimeDiagnostic = {
      code,
      severity,
      message,
      recoverable: true,
      timestamp: new Date(this.#scheduler.now()).toISOString(),
      context: diagnosticContext(context)
    };
    const aggregated = this.diagnostics.report(diagnostic);
    this.#diagnostics.push(aggregated);
    if (this.#diagnostics.length > this.#diagnosticLimit) this.#diagnostics.shift();
    this.#emit({ type: "diagnostic", diagnostic: aggregated, timestamp: diagnostic.timestamp });
  }

  #recordDiagnostic(diagnostic: RuntimeDiagnostic): void {
    const aggregated = this.diagnostics.report(diagnostic);
    this.#diagnostics.push(aggregated);
    if (this.#diagnostics.length > this.#diagnosticLimit) this.#diagnostics.shift();
    this.#emit({ type: "diagnostic", diagnostic: aggregated, timestamp: diagnostic.timestamp });
  }

  #setStatus(status: RuntimeEngineStatus): void {
    if (this.#status === status) return;
    const previousStatus = this.#status;
    this.#status = status;
    this.subscriptions.publishStatus(
      statusObservation(previousStatus, status, this.#scheduler.now())
    );
    this.#emit({
      type: "status",
      status,
      timestamp: new Date(this.#scheduler.now()).toISOString()
    });
  }

  #emit(event: RuntimeEngineEvent): void {
    if (event.type === "values") {
      this.subscriptions.publishValues(
        Object.freeze({
          values: Object.freeze([...event.values]),
          changedKeys: Object.freeze([...event.changedKeys]),
          revision: event.runtimeRevision,
          timestamp: event.visualCommit.snapshot.timestamp
        })
      );
      this.subscriptions.publishSnapshot(event.visualCommit);
    }
    for (const listener of [...this.#listeners])
      try {
        listener(event);
      } catch {
        if (event.type === "diagnostic") continue;
        const diagnostic: RuntimeDiagnostic = {
          code: "RUNTIME_SUBSCRIBER_ERROR",
          severity: "warning",
          message: "A Runtime Engine subscriber failed.",
          recoverable: true,
          timestamp: new Date(this.#scheduler.now()).toISOString(),
          context: {}
        };
        this.#diagnostics.push(this.diagnostics.report(diagnostic));
        if (this.#diagnostics.length > this.#diagnosticLimit) this.#diagnostics.shift();
      }
  }

  #unsubscribeFromProvider(): void {
    this.#unsubscribeProvider?.();
    this.#unsubscribeProviderStatus?.();
    this.#unsubscribeProvider = undefined;
    this.#unsubscribeProviderStatus = undefined;
  }

  #clearFlushTimer(): void {
    if (this.#flushTimer === undefined) return;
    this.#scheduler.clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
  }

  #clearFreshnessTimer(): void {
    if (this.#freshnessTimer === undefined) return;
    this.#scheduler.clearTimeout(this.#freshnessTimer);
    this.#freshnessTimer = undefined;
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer === undefined) return;
    this.#scheduler.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }

  #assertUsable(): void {
    if (this.#status === "disposed")
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime Engine is disposed.");
  }
}

export function createRuntimeEngine(options: RuntimeEngineOptions): RuntimeEngine {
  return new ProviderRuntimeEngine(options);
}
