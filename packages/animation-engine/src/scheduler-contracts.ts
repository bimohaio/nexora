import type { AnimationPriority, VisibilityState } from "./contracts.js";

/** Scheduler-local task identity. It is transient and is never persisted in a document. */
export type AnimationTaskId = string & { readonly __brand: "AnimationTaskId" };

/** Lifecycle of one registration. Terminal registrations cannot be resumed. */
export type AnimationTaskState =
  | "registered"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "disposed"
  | "failed";

/** Lifecycle of one independently owned scheduler instance. */
export type AnimationSchedulerState = "idle" | "running" | "paused" | "stopped" | "disposed";

/** Normalized reduced-motion state delivered to tasks. */
export type ReducedMotionState = "reduce" | "no-preference";
export type ReducedMotionMode = "automatic" | ReducedMotionState;
export type AnimationTaskMotionBehavior = "allow" | "reduce" | "disable" | "static-final-state";

/** Readonly, renderer-neutral timing information for one dispatched frame. */
export interface AnimationFrameContext {
  readonly timestamp: number;
  readonly deltaTime: number;
  readonly unscaledDeltaTime: number;
  readonly elapsedTime: number;
  readonly frame: number;
  readonly playbackRate: number;
  readonly reducedMotion: boolean;
  readonly visibility: VisibilityState;
  readonly deltaClamped: boolean;
}

export type AnimationFrameStatus = "continue" | "complete" | "pause" | "sleep";
export type AnimationInvalidationTarget =
  | "symbol"
  | "node"
  | "connection"
  | "overlay"
  | "alarm-visual"
  | "animation-target";

/** A target identifier only; renderer-private objects are intentionally excluded. */
export interface AnimationInvalidation {
  readonly targetType: AnimationInvalidationTarget;
  readonly targetId: string;
  readonly reason?: string;
}

/** Result returned by a task. Omitted status means `continue`. */
export interface AnimationFrameResult {
  readonly status?: AnimationFrameStatus;
  readonly invalidations?: readonly Readonly<AnimationInvalidation>[];
}

/** Caller-owned task descriptor. The scheduler reads it but never mutates it. */
export interface AnimationTask {
  readonly id?: AnimationTaskId;
  readonly priority?: AnimationPriority;
  readonly motionBehavior?: AnimationTaskMotionBehavior;
  // `void` intentionally permits ergonomic callbacks that only mutate transient runtime state.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  readonly update: (context: Readonly<AnimationFrameContext>) => AnimationFrameResult | void;
  readonly onDispose?: () => void;
}

/** Stable capability handle scoped to exactly one task registration. */
export interface AnimationTaskHandle {
  readonly id: AnimationTaskId;
  readonly state: AnimationTaskState;
  pause(): void;
  resume(): void;
  cancel(): void;
  dispose(): void;
  setPriority(priority: AnimationPriority): void;
  isActive(): boolean;
  isPaused(): boolean;
}

/** Injectable monotonic millisecond source. */
export interface AnimationTimeSource {
  now(): number;
}

/** Injectable one-shot frame request boundary. The raw handle remains scheduler-private. */
export interface AnimationFrameDriver {
  request(callback: (timestamp: number) => void): unknown;
  cancel(handle: unknown): void;
}

export interface AnimationInvalidationBatch {
  readonly schedulerId: string;
  readonly frame: number;
  readonly invalidations: readonly Readonly<AnimationInvalidation>[];
}

export interface AnimationInvalidationSink {
  commit(
    batch: Readonly<AnimationInvalidationBatch>,
    context: Readonly<AnimationFrameContext>
  ): void;
}

export type SchedulerErrorCode =
  | "ANIMATION_SCHEDULER_DISPOSED"
  | "ANIMATION_DUPLICATE_TASK_ID"
  | "ANIMATION_INVALID_TASK"
  | "ANIMATION_INVALID_PRIORITY"
  | "ANIMATION_INVALID_TIMESTAMP"
  | "ANIMATION_TIME_MOVED_BACKWARD"
  | "ANIMATION_DELTA_CLAMPED"
  | "ANIMATION_TASK_UPDATE_FAILED"
  | "ANIMATION_TASK_DISPOSE_FAILED"
  | "ANIMATION_BATCH_COMMIT_FAILED"
  | "ANIMATION_FRAME_DRIVER_FAILED"
  | "ANIMATION_INVALID_STATE_TRANSITION"
  | "ANIMATION_MUTATION_QUEUE_OVERFLOW"
  | "ANIMATION_INVALIDATION_LIMIT";

export interface SchedulerDiagnostic {
  readonly code: SchedulerErrorCode;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly timestamp: number;
  readonly schedulerId: string;
  readonly taskId?: AnimationTaskId;
  readonly recoverable: boolean;
  readonly context: Readonly<Record<string, string | number | boolean>>;
  readonly cause?: unknown;
}

export interface AnimationSchedulerStatistics {
  readonly totalRegistrations: number;
  readonly totalFrames: number;
  readonly totalCallbackInvocations: number;
  readonly totalInvalidations: number;
  readonly totalCommittedBatches: number;
  readonly completedTaskCount: number;
  readonly failedTaskCount: number;
  readonly disposedTaskCount: number;
  readonly clampedDeltaCount: number;
  readonly skippedFrameCount: number;
  readonly lastTimestamp: number | undefined;
  readonly lastDelta: number;
  readonly averageDelta: number;
  readonly maximumObservedDelta: number;
}

export interface AnimationSchedulerSnapshot {
  readonly schedulerId: string;
  readonly state: AnimationSchedulerState;
  readonly activeTaskIds: readonly AnimationTaskId[];
  readonly pausedTaskIds: readonly AnimationTaskId[];
  readonly pendingFrameCount: 0 | 1;
  readonly queuedMutationCount: number;
  readonly frame: number;
  readonly playbackRate: number;
  readonly reducedMotion: ReducedMotionState;
  readonly visibility: VisibilityState;
  readonly statistics: Readonly<AnimationSchedulerStatistics>;
  readonly diagnostics: readonly Readonly<SchedulerDiagnostic>[];
}

export interface AnimationSchedulerLogger {
  log(diagnostic: Readonly<SchedulerDiagnostic>): void;
}

export interface AnimationSchedulerOptions {
  readonly id?: string;
  readonly autoStart?: boolean;
  readonly maxDeltaMs?: number;
  readonly playbackRate?: number;
  readonly diagnosticCapacity?: number;
  readonly mutationLimit?: number;
  readonly invalidationLimit?: number;
  readonly timeSource: AnimationTimeSource;
  readonly frameDriver: AnimationFrameDriver;
  readonly invalidationSink?: AnimationInvalidationSink;
  readonly logger?: AnimationSchedulerLogger;
  readonly reducedMotion?: ReducedMotionState;
  readonly visibility?: VisibilityState;
}

/** Public scheduler capability. Calls are reentrancy-safe and post-disposal lifecycle calls no-op. */
export interface AnimationScheduler {
  readonly id: string;
  readonly state: AnimationSchedulerState;
  register(task: Readonly<AnimationTask>): AnimationTaskHandle;
  unregister(id: AnimationTaskId): void;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  clear(): void;
  dispose(): void;
  requestFrame(): void;
  setPlaybackRate(rate: number): void;
  setReducedMotion(state: ReducedMotionState): void;
  setVisibility(state: VisibilityState): void;
  getSnapshot(): Readonly<AnimationSchedulerSnapshot>;
}
