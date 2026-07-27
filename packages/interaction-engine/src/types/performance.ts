export type InteractionPriority = "critical" | "high" | "normal" | "low" | "idle";
export type SchedulingMode = "frame" | "microtask" | "macrotask" | "idle";

export interface ScheduledInteractionWork {
  readonly id: string;
  readonly priority?: InteractionPriority;
  readonly mode?: SchedulingMode;
  readonly coalesceKey?: string;
  readonly obsoleteKey?: string;
  readonly execute: () => void;
}

export interface SchedulerTimingAdapter {
  frame(task: () => void): { cancel(): void };
  microtask(task: () => void): { cancel(): void };
  macrotask(task: () => void): { cancel(): void };
  idle?(task: () => void): { cancel(): void };
  now(): number;
}

export interface InteractionPerformanceSnapshot {
  readonly eventCount: number;
  readonly averageEventLatency: number;
  readonly averageDispatchDuration: number;
  readonly averageSchedulerDuration: number;
  readonly cacheHitRatio: number;
  readonly allocationCount: number;
  readonly averageFrameTime: number;
  readonly maximumQueueLength: number;
  readonly interactionFps: number;
  readonly droppedFrames: number;
}

export interface ProfileSpan {
  readonly name: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly duration: number;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface CacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
  readonly hitRatio: number;
  readonly revision: number;
}
