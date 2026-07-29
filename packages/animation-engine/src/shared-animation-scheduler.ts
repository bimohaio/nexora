import type { AnimationPriority, VisibilityState } from "./contracts.js";
import { AnimationDisposedError, AnimationRegistrationError } from "./errors.js";
import type {
  AnimationFrameContext,
  AnimationFrameResult,
  AnimationInvalidation,
  AnimationScheduler,
  AnimationSchedulerOptions,
  AnimationSchedulerSnapshot,
  AnimationSchedulerState,
  AnimationSchedulerStatistics,
  AnimationTask,
  AnimationTaskHandle,
  AnimationTaskId,
  AnimationTaskMotionBehavior,
  AnimationTaskState,
  ReducedMotionState,
  SchedulerDiagnostic,
  SchedulerErrorCode
} from "./scheduler-contracts.js";

const PRIORITY: Readonly<Record<AnimationPriority, number>> = {
  accessibility: 6,
  "critical-alarm": 5,
  alarm: 4,
  runtime: 3,
  "designer-preview": 2,
  decorative: 1
};
const VALID_VISIBILITY = new Set<VisibilityState>([
  "visible",
  "partially-visible",
  "offscreen",
  "document-hidden",
  "unmounted"
]);

interface Entry {
  readonly id: AnimationTaskId;
  readonly sequence: number;
  readonly task: Readonly<AnimationTask>;
  state: AnimationTaskState;
  priority: AnimationPriority;
  disposeCalled: boolean;
  policyPaused: boolean;
}

interface Counters {
  totalRegistrations: number;
  totalFrames: number;
  totalCallbackInvocations: number;
  totalInvalidations: number;
  totalCommittedBatches: number;
  completedTaskCount: number;
  failedTaskCount: number;
  disposedTaskCount: number;
  clampedDeltaCount: number;
  skippedFrameCount: number;
  deltaTotal: number;
  lastDelta: number;
  maximumObservedDelta: number;
}

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
let schedulerSequence = 0;

class TaskHandle implements AnimationTaskHandle {
  public constructor(
    public readonly id: AnimationTaskId,
    private scheduler: SharedAnimationScheduler | undefined
  ) {}
  public get state(): AnimationTaskState {
    return this.scheduler?.taskState(this.id) ?? "disposed";
  }
  public pause(): void {
    this.scheduler?.pauseTask(this.id);
  }
  public resume(): void {
    this.scheduler?.resumeTask(this.id);
  }
  public cancel(): void {
    this.scheduler?.cancelTask(this.id);
  }
  public dispose(): void {
    this.scheduler?.disposeTask(this.id);
    this.scheduler = undefined;
  }
  public setPriority(priority: AnimationPriority): void {
    this.scheduler?.setTaskPriority(this.id, priority);
  }
  public isActive(): boolean {
    return ["registered", "scheduled", "running"].includes(this.state);
  }
  public isPaused(): boolean {
    return this.state === "paused";
  }
}

/**
 * Renderer-neutral shared frame scheduler.
 *
 * One instance owns at most one pending driver callback. Registrations made during dispatch begin
 * on the next frame; cancellations take effect immediately for tasks not yet visited. All time is
 * expressed in milliseconds and all task/scheduler disposal operations are idempotent.
 */
export class SharedAnimationScheduler implements AnimationScheduler {
  public readonly id: string;
  readonly #entries = new Map<AnimationTaskId, Entry>();
  readonly #reservedIds = new Set<AnimationTaskId>();
  readonly #terminalStates = new Map<AnimationTaskId, AnimationTaskState>();
  readonly #diagnostics: SchedulerDiagnostic[] = [];
  readonly #mutations: (() => void)[] = [];
  readonly #options: {
    readonly autoStart: boolean;
    readonly maxDeltaMs: number;
    readonly diagnosticCapacity: number;
    readonly mutationLimit: number;
    readonly invalidationLimit: number;
  };
  readonly #timeSource: AnimationSchedulerOptions["timeSource"];
  readonly #frameDriver: AnimationSchedulerOptions["frameDriver"];
  #sink: AnimationSchedulerOptions["invalidationSink"];
  #logger: AnimationSchedulerOptions["logger"];
  #state: AnimationSchedulerState;
  #pendingHandle: unknown;
  #pendingToken = 0;
  #dispatching = false;
  #disposeRequested = false;
  #sequence = 0;
  #frame = 0;
  #lastTimestamp: number | undefined;
  #elapsedTime = 0;
  #playbackRate: number;
  #reducedMotion: ReducedMotionState;
  #visibility: VisibilityState;
  readonly #counters: Counters = {
    totalRegistrations: 0,
    totalFrames: 0,
    totalCallbackInvocations: 0,
    totalInvalidations: 0,
    totalCommittedBatches: 0,
    completedTaskCount: 0,
    failedTaskCount: 0,
    disposedTaskCount: 0,
    clampedDeltaCount: 0,
    skippedFrameCount: 0,
    deltaTotal: 0,
    lastDelta: 0,
    maximumObservedDelta: 0
  };

  public constructor(options: Readonly<AnimationSchedulerOptions>) {
    validateOptions(options);
    const requestedId = options.id?.trim();
    this.id =
      requestedId === undefined || requestedId === ""
        ? `animation-scheduler-${String(++schedulerSequence)}`
        : requestedId;
    this.#options = Object.freeze({
      autoStart: options.autoStart ?? true,
      maxDeltaMs: options.maxDeltaMs ?? 100,
      diagnosticCapacity: options.diagnosticCapacity ?? 100,
      mutationLimit: options.mutationLimit ?? 10_000,
      invalidationLimit: options.invalidationLimit ?? 10_000
    });
    this.#timeSource = options.timeSource;
    this.#frameDriver = options.frameDriver;
    this.#sink = options.invalidationSink;
    this.#logger = options.logger;
    this.#playbackRate = options.playbackRate ?? 1;
    this.#reducedMotion = options.reducedMotion ?? "no-preference";
    this.#visibility = options.visibility ?? "visible";
    this.#state = this.#options.autoStart ? "running" : "idle";
  }

  public get state(): AnimationSchedulerState {
    return this.#state;
  }

  public register(task: Readonly<AnimationTask>): AnimationTaskHandle {
    this.#assertUsable();
    if (typeof task.update !== "function")
      throw new AnimationRegistrationError("Animation task update must be a function.", {
        code: "ANIMATION_INVALID_TASK"
      });
    const id = task.id ?? (`task-${String(++this.#sequence)}` as AnimationTaskId);
    if (id.trim() === "")
      throw new AnimationRegistrationError("Animation task ID must not be empty.", {
        code: "ANIMATION_INVALID_TASK",
        animationId: id
      });
    if (this.#entries.has(id) || this.#reservedIds.has(id))
      throw new AnimationRegistrationError(`Animation task ID '${id}' is already registered.`, {
        code: "ANIMATION_DUPLICATE_TASK_ID",
        animationId: id
      });
    const sequence = task.id === undefined ? this.#sequence : ++this.#sequence;
    const entry: Entry = {
      id,
      sequence,
      task,
      state: "registered",
      priority: task.priority ?? "runtime",
      disposeCalled: false,
      policyPaused: false
    };
    this.#reservedIds.add(id);
    const apply = (): void => {
      this.#reservedIds.delete(id);
      if (this.#state === "disposed") return;
      this.#entries.set(id, entry);
      this.#terminalStates.delete(id);
      entry.state = "scheduled";
      this.#counters.totalRegistrations += 1;
      this.#scheduleIfNeeded();
    };
    if (this.#dispatching) this.#queueMutation(apply);
    else apply();
    return new TaskHandle(id, this);
  }

  public unregister(id: AnimationTaskId): void {
    this.cancelTask(id);
  }
  public start(): void {
    if (this.#state === "disposed") return;
    if (this.#state === "running") return;
    this.#state = "running";
    this.#resetBaseline();
    this.#scheduleIfNeeded();
  }
  public pause(): void {
    if (this.#state === "disposed" || this.#state === "paused") return;
    this.#state = "paused";
    this.#cancelPending();
    this.#resetBaseline();
  }
  public resume(): void {
    if (this.#state === "disposed" || this.#state === "running") return;
    this.#state = "running";
    this.#resetBaseline();
    this.#scheduleIfNeeded();
  }
  public stop(): void {
    if (this.#state === "disposed" || this.#state === "stopped") return;
    this.#state = "stopped";
    this.#cancelPending();
    this.#resetBaseline();
  }
  public clear(): void {
    if (this.#state === "disposed") return;
    const clear = (): void => {
      for (const entry of [...this.#entries.values()]) this.#removeEntry(entry, "disposed");
      this.#cancelPending();
    };
    if (this.#dispatching) this.#queueMutation(clear);
    else clear();
  }
  public dispose(): void {
    if (this.#state === "disposed" || this.#disposeRequested) return;
    this.#disposeRequested = true;
    this.#cancelPending();
    const dispose = (): void => {
      for (const entry of [...this.#entries.values()]) this.#removeEntry(entry, "disposed");
      this.#entries.clear();
      this.#reservedIds.clear();
      this.#mutations.length = 0;
      this.#state = "disposed";
      this.#sink = undefined;
      this.#logger = undefined;
      this.#disposeRequested = false;
    };
    if (this.#dispatching) this.#queueMutation(dispose, true);
    else dispose();
  }
  public requestFrame(): void {
    if (this.#state === "disposed" || this.#state === "paused" || this.#state === "stopped") return;
    this.#scheduleIfNeeded();
  }
  public setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0) throw new RangeError("Playback rate must be finite.");
    this.#playbackRate = rate;
  }
  public setReducedMotion(state: ReducedMotionState): void {
    if (this.#reducedMotion === state) return;
    this.#reducedMotion = state;
    if (state === "no-preference")
      for (const entry of this.#entries.values())
        if (entry.policyPaused) {
          entry.policyPaused = false;
          entry.state = "scheduled";
        }
    this.#resetBaseline();
    this.requestFrame();
  }
  public setVisibility(state: VisibilityState): void {
    if (!VALID_VISIBILITY.has(state)) throw new TypeError("Visibility state is invalid.");
    if (this.#visibility === state) return;
    this.#visibility = state;
    this.#resetBaseline();
    if (this.#suppressesAllFrames()) this.#cancelPending();
    else this.requestFrame();
  }

  public getSnapshot(): Readonly<AnimationSchedulerSnapshot> {
    const active: AnimationTaskId[] = [];
    const paused: AnimationTaskId[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.state === "paused") paused.push(entry.id);
      else active.push(entry.id);
    }
    return Object.freeze({
      schedulerId: this.id,
      state: this.#state,
      activeTaskIds: freezeArray(active),
      pausedTaskIds: freezeArray(paused),
      pendingFrameCount: this.#pendingHandle === undefined ? 0 : 1,
      queuedMutationCount: this.#mutations.length,
      frame: this.#frame,
      playbackRate: this.#playbackRate,
      reducedMotion: this.#reducedMotion,
      visibility: this.#visibility,
      statistics: this.#statistics(),
      diagnostics: freezeArray(this.#diagnostics)
    });
  }

  public taskState(id: AnimationTaskId): AnimationTaskState {
    return (
      this.#entries.get(id)?.state ??
      (this.#reservedIds.has(id) ? "registered" : undefined) ??
      this.#terminalStates.get(id) ??
      "disposed"
    );
  }
  public pauseTask(id: AnimationTaskId): void {
    this.#mutateEntry(id, (entry) => {
      if (["registered", "scheduled", "running"].includes(entry.state)) entry.state = "paused";
    });
  }
  public resumeTask(id: AnimationTaskId): void {
    this.#mutateEntry(id, (entry) => {
      if (entry.state === "paused") {
        entry.state = "scheduled";
        this.#scheduleIfNeeded();
      }
    });
  }
  public cancelTask(id: AnimationTaskId): void {
    const entry = this.#entries.get(id);
    if (entry !== undefined) entry.state = "cancelled";
    const cancel = (): void => {
      const current = this.#entries.get(id);
      if (current !== undefined) this.#removeEntry(current, "cancelled");
    };
    if (this.#dispatching) this.#queueMutation(cancel);
    else cancel();
  }
  public disposeTask(id: AnimationTaskId): void {
    const entry = this.#entries.get(id);
    if (entry !== undefined) entry.state = "disposed";
    const dispose = (): void => {
      const current = this.#entries.get(id);
      if (current !== undefined) this.#removeEntry(current, "disposed");
    };
    if (this.#dispatching) this.#queueMutation(dispose);
    else dispose();
  }
  public setTaskPriority(id: AnimationTaskId, priority: AnimationPriority): void {
    if (!(priority in PRIORITY)) throw new TypeError("Animation priority is invalid.");
    this.#mutateEntry(id, (entry) => {
      entry.priority = priority;
    });
  }

  #mutateEntry(id: AnimationTaskId, mutation: (entry: Entry) => void): void {
    const apply = (): void => {
      const entry = this.#entries.get(id);
      if (entry !== undefined) mutation(entry);
    };
    if (this.#dispatching) this.#queueMutation(apply);
    else apply();
  }
  #queueMutation(mutation: () => void, precedence = false): void {
    if (this.#mutations.length >= this.#options.mutationLimit) {
      this.#diagnostic(
        "ANIMATION_MUTATION_QUEUE_OVERFLOW",
        "error",
        "Animation mutation queue limit was reached."
      );
      return;
    }
    if (precedence) this.#mutations.unshift(mutation);
    else this.#mutations.push(mutation);
  }
  #applyMutations(): void {
    let applied = 0;
    while (this.#mutations.length > 0 && applied < this.#options.mutationLimit) {
      const mutation = this.#mutations.shift();
      mutation?.();
      applied += 1;
      if (this.#state === "disposed") {
        this.#mutations.length = 0;
        break;
      }
    }
  }
  #scheduleIfNeeded(): void {
    if (
      this.#pendingHandle !== undefined ||
      this.#state !== "running" ||
      this.#disposeRequested ||
      this.#suppressesAllFrames() ||
      !this.#hasDispatchableTask()
    )
      return;
    const token = ++this.#pendingToken;
    try {
      this.#pendingHandle = this.#frameDriver.request((timestamp) => {
        if (token !== this.#pendingToken) {
          this.#counters.skippedFrameCount += 1;
          return;
        }
        this.#pendingHandle = undefined;
        this.#dispatch(timestamp);
      });
    } catch (cause) {
      this.#pendingHandle = undefined;
      this.#diagnostic(
        "ANIMATION_FRAME_DRIVER_FAILED",
        "error",
        "Animation frame request failed.",
        undefined,
        cause
      );
    }
  }
  #cancelPending(): void {
    if (this.#pendingHandle === undefined) return;
    const handle = this.#pendingHandle;
    this.#pendingHandle = undefined;
    this.#pendingToken += 1;
    try {
      this.#frameDriver.cancel(handle);
    } catch (cause) {
      this.#diagnostic(
        "ANIMATION_FRAME_DRIVER_FAILED",
        "warning",
        "Animation frame cancellation failed.",
        undefined,
        cause
      );
    }
  }
  #dispatch(driverTimestamp: number): void {
    if (this.#state !== "running" || this.#disposeRequested || this.#suppressesAllFrames()) return;
    const context = this.#createContext(driverTimestamp);
    const invalidations = new Map<string, Readonly<AnimationInvalidation>>();
    const entries = [...this.#entries.values()]
      .filter((entry) => entry.state === "scheduled" || entry.state === "registered")
      .sort(
        (left, right) =>
          PRIORITY[right.priority] - PRIORITY[left.priority] || left.sequence - right.sequence
      );
    this.#dispatching = true;
    this.#counters.totalFrames += 1;
    this.#frame += 1;
    for (const entry of entries) {
      if (this.#isDisposeRequested()) break;
      if (!this.#isEntryDispatchable(entry)) continue;
      if (!this.#motionAllows(entry.task.motionBehavior ?? "allow")) continue;
      entry.state = "running";
      this.#counters.totalCallbackInvocations += 1;
      try {
        const result = entry.task.update(context);
        this.#collectInvalidations(result, invalidations, entry.id);
        this.#interpretResult(entry, result);
      } catch (cause) {
        entry.state = "failed";
        this.#counters.failedTaskCount += 1;
        this.#diagnostic(
          "ANIMATION_TASK_UPDATE_FAILED",
          "error",
          "Animation task update failed.",
          entry.id,
          cause
        );
        this.#queueMutation(() => {
          this.#removeEntry(entry, "failed");
        });
      }
    }
    this.#dispatching = false;
    this.#applyMutations();
    if (!this.#isDisposed()) this.#commit(invalidations, context);
    this.#scheduleIfNeeded();
  }
  #createContext(timestamp: number): Readonly<AnimationFrameContext> {
    let normalized = timestamp;
    if (!Number.isFinite(normalized)) {
      this.#diagnostic(
        "ANIMATION_INVALID_TIMESTAMP",
        "warning",
        "Frame driver supplied a non-finite timestamp."
      );
      normalized = this.#safeNow();
    }
    let unscaled = this.#lastTimestamp === undefined ? 0 : normalized - this.#lastTimestamp;
    if (unscaled < 0) {
      this.#diagnostic(
        "ANIMATION_TIME_MOVED_BACKWARD",
        "warning",
        "Animation time moved backwards and was clamped."
      );
      unscaled = 0;
      normalized = this.#lastTimestamp ?? normalized;
    }
    let deltaClamped = false;
    if (unscaled > this.#options.maxDeltaMs) {
      unscaled = this.#options.maxDeltaMs;
      deltaClamped = true;
      this.#counters.clampedDeltaCount += 1;
      this.#diagnostic("ANIMATION_DELTA_CLAMPED", "warning", "Animation frame delta was clamped.");
    }
    const delta = unscaled * this.#playbackRate;
    this.#lastTimestamp = normalized;
    this.#elapsedTime += delta;
    this.#counters.deltaTotal += delta;
    this.#counters.lastDelta = delta;
    this.#counters.maximumObservedDelta = Math.max(this.#counters.maximumObservedDelta, delta);
    return Object.freeze({
      timestamp: normalized,
      deltaTime: delta,
      unscaledDeltaTime: unscaled,
      elapsedTime: this.#elapsedTime,
      frame: this.#frame + 1,
      playbackRate: this.#playbackRate,
      reducedMotion: this.#reducedMotion === "reduce",
      visibility: this.#visibility,
      deltaClamped
    });
  }
  #safeNow(): number {
    try {
      const now = this.#timeSource.now();
      return Number.isFinite(now) ? now : (this.#lastTimestamp ?? 0);
    } catch {
      return this.#lastTimestamp ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  #interpretResult(entry: Entry, result: AnimationFrameResult | void): void {
    const status = result?.status ?? "continue";
    if (status === "complete") {
      entry.state = "completed";
      this.#counters.completedTaskCount += 1;
      this.#queueMutation(() => {
        this.#removeEntry(entry, "completed");
      });
    } else if (status === "pause" || status === "sleep") entry.state = "paused";
    else if (
      this.#reducedMotion === "reduce" &&
      entry.task.motionBehavior === "static-final-state"
    ) {
      entry.state = "paused";
      entry.policyPaused = true;
    } else entry.state = "scheduled";
  }
  #collectInvalidations(
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    result: AnimationFrameResult | void,
    invalidations: Map<string, Readonly<AnimationInvalidation>>,
    taskId: AnimationTaskId
  ): void {
    for (const invalidation of result?.invalidations ?? []) {
      if (invalidation.targetId.trim() === "") {
        this.#diagnostic(
          "ANIMATION_INVALID_TASK",
          "warning",
          "Animation invalidation target ID is empty.",
          taskId
        );
        continue;
      }
      const key = `${invalidation.targetType}\u0000${invalidation.targetId}\u0000${invalidation.reason ?? ""}`;
      if (invalidations.has(key)) continue;
      if (invalidations.size >= this.#options.invalidationLimit) {
        this.#diagnostic(
          "ANIMATION_INVALIDATION_LIMIT",
          "warning",
          "Animation invalidation limit was reached.",
          taskId
        );
        break;
      }
      invalidations.set(key, Object.freeze({ ...invalidation }));
    }
  }
  #commit(
    invalidations: ReadonlyMap<string, Readonly<AnimationInvalidation>>,
    context: Readonly<AnimationFrameContext>
  ): void {
    if (invalidations.size === 0 || this.#sink === undefined) return;
    const values = freezeArray([...invalidations.values()]);
    this.#counters.totalInvalidations += values.length;
    try {
      this.#sink.commit(
        Object.freeze({ schedulerId: this.id, frame: context.frame, invalidations: values }),
        context
      );
      this.#counters.totalCommittedBatches += 1;
    } catch (cause) {
      this.#diagnostic(
        "ANIMATION_BATCH_COMMIT_FAILED",
        "error",
        "Animation invalidation batch commit failed.",
        undefined,
        cause
      );
    }
  }
  #removeEntry(entry: Entry, terminal: AnimationTaskState): void {
    if (!this.#entries.has(entry.id)) return;
    this.#entries.delete(entry.id);
    entry.state = terminal;
    this.#terminalStates.set(entry.id, terminal);
    if (this.#terminalStates.size > this.#options.diagnosticCapacity) {
      const oldest = this.#terminalStates.keys().next();
      if (!oldest.done) this.#terminalStates.delete(oldest.value);
    }
    if (!entry.disposeCalled) {
      entry.disposeCalled = true;
      try {
        entry.task.onDispose?.();
      } catch (cause) {
        this.#diagnostic(
          "ANIMATION_TASK_DISPOSE_FAILED",
          "warning",
          "Animation task disposal hook failed.",
          entry.id,
          cause
        );
      }
    }
    if (terminal === "disposed" || terminal === "cancelled") this.#counters.disposedTaskCount += 1;
  }
  #motionAllows(behavior: AnimationTaskMotionBehavior): boolean {
    return (
      this.#reducedMotion !== "reduce" ||
      behavior === "allow" ||
      behavior === "reduce" ||
      behavior === "static-final-state"
    );
  }
  #suppressesAllFrames(): boolean {
    return this.#visibility === "document-hidden" || this.#visibility === "unmounted";
  }
  #hasDispatchableTask(): boolean {
    for (const entry of this.#entries.values())
      if (
        (entry.state === "registered" || entry.state === "scheduled") &&
        this.#motionAllows(entry.task.motionBehavior ?? "allow")
      )
        return true;
    return false;
  }
  #resetBaseline(): void {
    this.#lastTimestamp = undefined;
  }
  #statistics(): Readonly<AnimationSchedulerStatistics> {
    return Object.freeze({
      totalRegistrations: this.#counters.totalRegistrations,
      totalFrames: this.#counters.totalFrames,
      totalCallbackInvocations: this.#counters.totalCallbackInvocations,
      totalInvalidations: this.#counters.totalInvalidations,
      totalCommittedBatches: this.#counters.totalCommittedBatches,
      completedTaskCount: this.#counters.completedTaskCount,
      failedTaskCount: this.#counters.failedTaskCount,
      disposedTaskCount: this.#counters.disposedTaskCount,
      clampedDeltaCount: this.#counters.clampedDeltaCount,
      skippedFrameCount: this.#counters.skippedFrameCount,
      lastTimestamp: this.#lastTimestamp,
      lastDelta: this.#counters.lastDelta,
      averageDelta:
        this.#counters.totalFrames === 0
          ? 0
          : this.#counters.deltaTotal / this.#counters.totalFrames,
      maximumObservedDelta: this.#counters.maximumObservedDelta
    });
  }
  #diagnostic(
    code: SchedulerErrorCode,
    severity: SchedulerDiagnostic["severity"],
    message: string,
    taskId?: AnimationTaskId,
    cause?: unknown
  ): void {
    const diagnostic = Object.freeze({
      code,
      severity,
      message,
      timestamp: this.#safeNow(),
      schedulerId: this.id,
      ...(taskId === undefined ? {} : { taskId }),
      recoverable: code !== "ANIMATION_SCHEDULER_DISPOSED",
      context: Object.freeze({}),
      ...(cause === undefined ? {} : { cause })
    }) satisfies SchedulerDiagnostic;
    this.#diagnostics.push(diagnostic);
    if (this.#diagnostics.length > this.#options.diagnosticCapacity) this.#diagnostics.shift();
    this.#logger?.log(diagnostic);
  }
  #assertUsable(): void {
    if (this.#state === "disposed")
      throw new AnimationDisposedError("Animation scheduler is disposed.", {
        code: "ANIMATION_SCHEDULER_DISPOSED"
      });
  }
  #isDisposed(): boolean {
    return this.#state === "disposed";
  }
  #isDisposeRequested(): boolean {
    return this.#disposeRequested;
  }
  #isEntryDispatchable(entry: Entry): boolean {
    return this.#entries.has(entry.id) && entry.state !== "cancelled" && entry.state !== "disposed";
  }
}

function validateOptions(options: Readonly<AnimationSchedulerOptions>): void {
  if (
    typeof options.frameDriver.request !== "function" ||
    typeof options.frameDriver.cancel !== "function"
  )
    throw new TypeError("A valid animation frame driver is required.");
  if (typeof options.timeSource.now !== "function")
    throw new TypeError("A valid animation time source is required.");
  const positive = [
    ["maxDeltaMs", options.maxDeltaMs ?? 100],
    ["diagnosticCapacity", options.diagnosticCapacity ?? 100],
    ["mutationLimit", options.mutationLimit ?? 10_000],
    ["invalidationLimit", options.invalidationLimit ?? 10_000]
  ] as const;
  for (const [name, value] of positive)
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(`${name} must be finite and positive.`);
  if (!Number.isFinite(options.playbackRate ?? 1) || (options.playbackRate ?? 1) < 0)
    throw new RangeError("playbackRate must be finite and non-negative.");
}
