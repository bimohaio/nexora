import type { JsonValue } from "@web-scada/core";
import type { BindingDefinition, BindingDependency, BindingDiagnostic } from "./contracts.js";
import {
  IncrementalBindingEngine,
  type IncrementalBindingEvaluationFunction,
  type IncrementalEvaluationContext,
  type IncrementalEvaluationResult
} from "./incremental.js";
import type { VisualTargetKind } from "./visual-properties.js";
import { normalizeBindingDependencies } from "./dependencies.js";
import {
  BoundedBindingCache,
  resolveBindingCacheOptions,
  type BindingCacheOptions,
  type BindingCacheStatistics
} from "./cache.js";

export type BindingSchedulingMode = "immediate" | "deferred" | "manual";
export type BindingExecutionStatus =
  | "committed"
  | "partial"
  | "no-changes"
  | "scheduled"
  | "superseded"
  | "cancelled"
  | "disposed"
  | "failed";

export interface ScheduledBindingTask {
  readonly cancelled: boolean;
  cancel(): void;
}

export interface BindingSchedulingAdapter {
  schedule(task: () => void): ScheduledBindingTask;
}

class BindingTask implements ScheduledBindingTask {
  #cancelled = false;
  public constructor(private readonly cancelTask: () => void) {}
  public get cancelled(): boolean {
    return this.#cancelled;
  }
  public cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.cancelTask();
  }
}

/** Executes before `schedule` returns; cancellation is necessarily best-effort afterward. */
export class ImmediateBindingSchedulingAdapter implements BindingSchedulingAdapter {
  public schedule(task: () => void): ScheduledBindingTask {
    const handle = new BindingTask(() => undefined);
    task();
    return handle;
  }
}

export class MicrotaskBindingSchedulingAdapter implements BindingSchedulingAdapter {
  public schedule(task: () => void): ScheduledBindingTask {
    const handle = new BindingTask(() => undefined);
    queueMicrotask(() => {
      if (!handle.cancelled) task();
    });
    return handle;
  }
}

export class ManualBindingSchedulingAdapter implements BindingSchedulingAdapter {
  readonly #tasks: BindingTask[] = [];
  readonly #callbacks = new Map<BindingTask, () => void>();
  public get pendingCount(): number {
    return this.#callbacks.size;
  }
  public schedule(task: () => void): ScheduledBindingTask {
    const handle = new BindingTask(() => this.#callbacks.delete(handle));
    this.#tasks.push(handle);
    this.#callbacks.set(handle, task);
    return handle;
  }
  public flushOne(): void {
    const handle = this.#tasks.shift();
    if (handle === undefined) return;
    const task = this.#callbacks.get(handle);
    this.#callbacks.delete(handle);
    if (!handle.cancelled) task?.();
  }
  public flushAll(): void {
    while (this.#tasks.length > 0) this.flushOne();
  }
}

export interface BindingEvaluationRequest {
  readonly runtimeRevision: number;
  readonly context: Readonly<IncrementalEvaluationContext>;
  readonly changedInputs?: readonly BindingDependency[];
  readonly changedBindings?: readonly string[];
  readonly removedBindings?: readonly string[];
  readonly forceBindings?: readonly string[];
  readonly full?: boolean;
  readonly reason?: string;
}

interface PendingBatch {
  runtimeRevision: number;
  context: Readonly<IncrementalEvaluationContext>;
  changedInputs: BindingDependency[];
  changedBindings: Set<string>;
  removedBindings: Set<string>;
  forceBindings: Set<string>;
  full: boolean;
  reasons: Set<string>;
}

export interface BindingExecutionToken {
  readonly coordinatorId: string;
  readonly generation: number;
  readonly executionId: number;
  readonly runtimeRevision: number;
  readonly graphRevision: number;
}

export interface BindingExecutionReport {
  readonly token?: BindingExecutionToken;
  readonly status: BindingExecutionStatus;
  readonly requestedInputs: number;
  readonly affectedBindings: number;
  readonly evaluatedBindings: number;
  readonly committedBindings: number;
  readonly unchangedBindings: number;
  readonly failedBindings: number;
  readonly skippedBindings: number;
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly result?: IncrementalEvaluationResult;
}

export interface BindingCoordinatorStatistics {
  readonly requests: number;
  readonly scheduledFlushes: number;
  readonly executions: number;
  readonly superseded: number;
  readonly cancellations: number;
  readonly resultCache: BindingCacheStatistics;
}

export interface BindingEvaluationCoordinatorOptions {
  readonly schedulingMode?: BindingSchedulingMode;
  readonly scheduler?: BindingSchedulingAdapter;
  readonly cache?: BindingCacheOptions;
  readonly maxPassesPerDrain?: number;
  readonly coordinatorId?: string;
  readonly onOutcome?: (outcome: BindingExecutionReport) => void;
  readonly evaluate?: IncrementalBindingEvaluationFunction;
  readonly targetKind?: (definition: Readonly<BindingDefinition>) => VisualTargetKind | undefined;
}

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  severity: BindingDiagnostic["severity"] = "error",
  context: Readonly<Record<string, JsonValue>> = {}
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity,
    message,
    recoverable: true,
    context: Object.freeze({ ...context })
  });
}

function empty(
  status: BindingExecutionStatus,
  diagnostics: readonly BindingDiagnostic[] = []
): BindingExecutionReport {
  return Object.freeze({
    status,
    requestedInputs: 0,
    affectedBindings: 0,
    evaluatedBindings: 0,
    committedBindings: 0,
    unchangedBindings: 0,
    failedBindings: 0,
    skippedBindings: 0,
    diagnostics: Object.freeze([...diagnostics])
  });
}

/** Coordinates coalescing and lifecycle while Phase 8.06 remains the sole planner. */
export class BindingEvaluationCoordinator {
  readonly #engine: IncrementalBindingEngine;
  readonly #mode: BindingSchedulingMode;
  readonly #scheduler: BindingSchedulingAdapter;
  readonly #coordinatorId: string;
  readonly #maxPasses: number;
  readonly #onOutcome: BindingEvaluationCoordinatorOptions["onOutcome"];
  readonly #resultCache: BoundedBindingCache<IncrementalEvaluationResult>;
  #pending: PendingBatch | undefined;
  #scheduled: ScheduledBindingTask | undefined;
  #generation = 0;
  #executionId = 0;
  #latestRequestedRevision = -1;
  #latestCommittedRevision = -1;
  #running = false;
  #disposed = false;
  #requests = 0;
  #scheduledFlushes = 0;
  #executions = 0;
  #superseded = 0;
  #cancellations = 0;

  public constructor(
    definitions: readonly Readonly<BindingDefinition>[],
    options: Readonly<BindingEvaluationCoordinatorOptions> = {}
  ) {
    this.#mode = options.schedulingMode ?? "deferred";
    this.#scheduler = options.scheduler ?? new MicrotaskBindingSchedulingAdapter();
    this.#coordinatorId =
      options.coordinatorId ?? `binding-coordinator-${String(++coordinatorSequence)}`;
    this.#maxPasses = options.maxPassesPerDrain ?? 100;
    if (!Number.isSafeInteger(this.#maxPasses) || this.#maxPasses < 1 || this.#maxPasses > 10_000)
      throw new RangeError("maxPassesPerDrain must be a safe integer from 1 to 10,000.");
    this.#onOutcome = options.onOutcome;
    const cacheOptions = resolveBindingCacheOptions(options.cache);
    this.#resultCache = new BoundedBindingCache(cacheOptions.maxResultEntries);
    this.#engine = new IncrementalBindingEngine(definitions, {
      ...(options.evaluate === undefined ? {} : { evaluate: options.evaluate }),
      ...(options.targetKind === undefined ? {} : { targetKind: options.targetKind })
    });
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public requestEvaluation(request: Readonly<BindingEvaluationRequest>): BindingExecutionReport {
    if (this.#disposed)
      return empty("disposed", [
        diagnostic("BINDING_ENGINE_DISPOSED", "Binding coordinator is disposed.")
      ]);
    const invalid = this.#validate(request);
    if (invalid !== undefined) return empty("failed", [invalid]);
    if (request.runtimeRevision < this.#latestRequestedRevision)
      return empty("superseded", [
        diagnostic(
          "BINDING_EXECUTION_SUPERSEDED",
          "Evaluation request revision is older than pending work.",
          "info"
        )
      ]);
    this.#requests += 1;
    this.#latestRequestedRevision = Math.max(
      this.#latestRequestedRevision,
      request.runtimeRevision
    );
    this.#merge(request);
    if (this.#mode === "immediate" && !this.#running) return this.flush();
    if (this.#mode === "deferred" && !this.#running) return this.#schedule();
    return empty("scheduled");
  }

  public flush(): BindingExecutionReport {
    if (this.#disposed) return empty("disposed");
    this.cancelScheduled();
    if (this.#running || this.#pending === undefined) return empty("no-changes");
    let outcome = empty("no-changes");
    let passes = 0;
    while (this.#hasPending() && passes < this.#maxPasses) {
      outcome = this.#execute();
      passes += 1;
    }
    if (this.#hasPending()) {
      const limit = diagnostic(
        "BINDING_COORDINATOR_DRAIN_LIMIT",
        "Coordinator drain pass limit was reached."
      );
      outcome = Object.freeze({
        ...outcome,
        status: "partial",
        diagnostics: Object.freeze([...outcome.diagnostics, limit])
      });
      if (this.#mode === "deferred") this.#schedule();
    }
    return outcome;
  }

  #hasPending(): boolean {
    return this.#pending !== undefined;
  }

  public cancelScheduled(): BindingExecutionReport {
    const handle = this.#scheduled;
    this.#scheduled = undefined;
    if (handle === undefined) return empty("no-changes");
    try {
      handle.cancel();
      this.#cancellations += 1;
      return empty("cancelled");
    } catch {
      return empty("failed", [
        diagnostic("BINDING_COORDINATOR_CANCEL_FAILED", "Scheduled flush cancellation failed.")
      ]);
    }
  }

  public reset(): void {
    if (this.#disposed) return;
    this.cancelScheduled();
    this.#pending = undefined;
    this.#generation += 1;
    this.#latestRequestedRevision = -1;
    this.#latestCommittedRevision = -1;
    this.#resultCache.clear();
    this.#engine.reset();
  }

  public addBinding(definition: Readonly<BindingDefinition>): void {
    if (this.#disposed) return;
    this.#engine.addBinding(definition);
    this.#generation += 1;
  }

  public replaceBinding(definition: Readonly<BindingDefinition>): void {
    if (this.#disposed) return;
    this.#engine.replaceBinding(definition);
    this.#generation += 1;
  }

  public removeBinding(bindingId: string): void {
    if (this.#disposed) return;
    this.#engine.removeBinding(bindingId);
    this.#generation += 1;
  }

  public statistics(): BindingCoordinatorStatistics {
    return Object.freeze({
      requests: this.#requests,
      scheduledFlushes: this.#scheduledFlushes,
      executions: this.#executions,
      superseded: this.#superseded,
      cancellations: this.#cancellations,
      resultCache: this.#resultCache.snapshot()
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.cancelScheduled();
    this.#pending = undefined;
    this.#generation += 1;
    this.#resultCache.clear();
    this.#engine.dispose();
    this.#disposed = true;
  }

  #validate(request: Readonly<BindingEvaluationRequest>): BindingDiagnostic | undefined {
    if (!Number.isSafeInteger(request.runtimeRevision) || request.runtimeRevision < 0)
      return diagnostic(
        "BINDING_COORDINATOR_INVALID_REQUEST",
        "Runtime revision must be a non-negative safe integer."
      );
    if (request.context.runtime.revision !== request.runtimeRevision)
      return diagnostic(
        "BINDING_COORDINATOR_INVALID_REQUEST",
        "Request and runtime snapshot revisions must match."
      );
    for (const id of [
      ...(request.changedBindings ?? []),
      ...(request.removedBindings ?? []),
      ...(request.forceBindings ?? [])
    ])
      if (typeof id !== "string" || id.trim() === "")
        return diagnostic(
          "BINDING_COORDINATOR_INVALID_REQUEST",
          "Binding identifiers must be non-empty strings."
        );
    return undefined;
  }

  #merge(request: Readonly<BindingEvaluationRequest>): void {
    const batch = this.#pending ?? {
      runtimeRevision: request.runtimeRevision,
      context: request.context,
      changedInputs: [],
      changedBindings: new Set<string>(),
      removedBindings: new Set<string>(),
      forceBindings: new Set<string>(),
      full: false,
      reasons: new Set<string>()
    };
    if (request.runtimeRevision >= batch.runtimeRevision) {
      batch.runtimeRevision = request.runtimeRevision;
      batch.context = request.context;
    }
    batch.changedInputs = [...batch.changedInputs, ...(request.changedInputs ?? [])];
    for (const id of request.changedBindings ?? []) batch.changedBindings.add(id.trim());
    for (const id of request.removedBindings ?? []) batch.removedBindings.add(id.trim());
    for (const id of request.forceBindings ?? []) batch.forceBindings.add(id.trim());
    batch.full ||= request.full === true;
    if (request.reason !== undefined && request.reason.trim() !== "")
      batch.reasons.add(request.reason);
    this.#pending = batch;
  }

  #schedule(): BindingExecutionReport {
    if (this.#scheduled !== undefined || this.#pending === undefined) return empty("scheduled");
    try {
      const executionIdBeforeSchedule = this.#executionId;
      const handle = this.#scheduler.schedule(() => {
        this.#scheduled = undefined;
        const outcome = this.flush();
        try {
          this.#onOutcome?.(outcome);
        } catch {
          // Listener failure is intentionally isolated from coordinator state.
        }
      });
      if (!this.#executedSince(executionIdBeforeSchedule)) this.#scheduled = handle;
      this.#scheduledFlushes += 1;
      return empty("scheduled");
    } catch {
      this.#scheduled = undefined;
      const outcome = empty("failed", [
        diagnostic(
          "BINDING_COORDINATOR_SCHEDULING_FAILED",
          "Scheduling adapter rejected the flush."
        )
      ]);
      try {
        this.#onOutcome?.(outcome);
      } catch {
        // Listener failure is isolated.
      }
      return outcome;
    }
  }

  #executedSince(executionId: number): boolean {
    return this.#executionId !== executionId;
  }

  #execute(): BindingExecutionReport {
    const batch = this.#pending;
    if (batch === undefined) return empty("no-changes");
    this.#pending = undefined;
    this.#running = true;
    this.#executionId += 1;
    this.#executions += 1;
    for (const bindingId of [...batch.removedBindings].sort())
      this.#engine.removeBinding(bindingId);
    const token = Object.freeze({
      coordinatorId: this.#coordinatorId,
      generation: this.#generation,
      executionId: this.#executionId,
      runtimeRevision: batch.runtimeRevision,
      graphRevision: this.#engine.graph.revision
    });
    let result: IncrementalEvaluationResult;
    try {
      result = this.#engine.evaluateChanges(batch.context, {
        revision: batch.runtimeRevision,
        changed: normalizeBindingDependencies(batch.changedInputs),
        reset: batch.full || batch.changedBindings.size > 0 || batch.forceBindings.size > 0
      });
    } finally {
      this.#running = false;
    }
    const stale =
      this.#disposed ||
      token.generation !== this.#generation ||
      token.runtimeRevision < this.#latestRequestedRevision ||
      token.graphRevision !== this.#engine.graph.revision ||
      token.runtimeRevision < this.#latestCommittedRevision;
    if (stale) {
      this.#superseded += 1;
      return Object.freeze({
        ...empty("superseded", [
          diagnostic(
            "BINDING_EXECUTION_SUPERSEDED",
            "Execution was superseded before commit.",
            "info"
          )
        ]),
        token
      });
    }
    this.#latestCommittedRevision = token.runtimeRevision;
    this.#resultCache.set(`${token.generation}:${token.runtimeRevision}`, result);
    const failed = result.evaluated.filter(
      ({ status }) => status === "error" || status === "invalid"
    ).length;
    const status: BindingExecutionStatus =
      failed > 0
        ? failed === result.evaluated.length
          ? "failed"
          : "partial"
        : result.statistics.changedBindingCount === 0
          ? "no-changes"
          : "committed";
    return Object.freeze({
      token,
      status,
      requestedInputs: batch.changedInputs.length,
      affectedBindings: result.statistics.affectedBindingCount,
      evaluatedBindings: result.statistics.evaluatedBindingCount,
      committedBindings: result.statistics.changedBindingCount,
      unchangedBindings: result.statistics.unchangedBindingCount,
      failedBindings: failed,
      skippedBindings: result.statistics.skippedBindingCount,
      diagnostics: result.diagnostics,
      result
    });
  }
}

let coordinatorSequence = 0;
