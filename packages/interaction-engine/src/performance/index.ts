import { InteractionCacheLayer } from "../cache/index.js";
import { InteractionPerformanceMetrics } from "../metrics/index.js";
import { InteractionObjectPools } from "../pool/index.js";
import { InteractionProfiler } from "../profiling/index.js";
import {
  InteractionPerformanceScheduler,
  type InteractionPerformanceSchedulerOptions
} from "../scheduler/index.js";
import type {
  InteractionPerformanceSnapshot,
  ScheduledInteractionWork
} from "../types/performance.js";

export interface InteractionPerformanceControllerOptions extends InteractionPerformanceSchedulerOptions {
  readonly profiling?: boolean;
}

export class InteractionPerformanceController {
  public readonly metrics = new InteractionPerformanceMetrics();
  public readonly profiler: InteractionProfiler;
  public readonly cache = new InteractionCacheLayer();
  public readonly pools: InteractionObjectPools;
  public readonly scheduler: InteractionPerformanceScheduler;
  #disposed = false;
  public constructor(options: InteractionPerformanceControllerOptions = {}) {
    this.profiler = new InteractionProfiler({
      ...(options.profiling === undefined ? {} : { enabled: options.profiling })
    });
    this.pools = new InteractionObjectPools(() => {
      this.metrics.recordAllocation();
    });
    this.scheduler = new InteractionPerformanceScheduler({
      ...options,
      onFrame: (duration, queueLength) => {
        this.metrics.recordFrame(duration, options.frameBudgetMs ?? 16);
        this.metrics.recordScheduler(duration, queueLength);
        options.onFrame?.(duration, queueLength);
      }
    });
  }
  public schedule(work: ScheduledInteractionWork): { cancel(): void } {
    return this.scheduler.scheduleWork(work);
  }
  public snapshot(): InteractionPerformanceSnapshot {
    return this.metrics.snapshot();
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.scheduler.dispose();
    this.cache.dispose();
    this.pools.dispose();
    this.profiler.dispose();
    this.metrics.dispose();
    this.#disposed = true;
  }
}
