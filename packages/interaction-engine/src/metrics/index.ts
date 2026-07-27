import { PerformanceError } from "../errors/index.js";
import type { CacheStatistics, InteractionPerformanceSnapshot } from "../types/performance.js";

export class InteractionPerformanceMetrics {
  #events = 0;
  #latency = 0;
  #dispatch = 0;
  #scheduler = 0;
  #allocations = 0;
  #frames = 0;
  #frameTime = 0;
  #dropped = 0;
  #maximumQueue = 0;
  #cacheHits = 0;
  #cacheMisses = 0;
  #disposed = false;
  public recordEvent(latency: number, dispatchDuration = 0): void {
    this.#validate(latency, dispatchDuration);
    this.#events++;
    this.#latency += latency;
    this.#dispatch += dispatchDuration;
  }
  public recordScheduler(duration: number, queueLength: number): void {
    this.#validate(duration, queueLength);
    this.#scheduler += duration;
    this.#maximumQueue = Math.max(this.#maximumQueue, queueLength);
  }
  public recordFrame(duration: number, budget = 16): void {
    this.#validate(duration, budget);
    this.#frames++;
    this.#frameTime += duration;
    if (duration > budget) this.#dropped++;
  }
  public recordAllocation(count = 1): void {
    this.#validate(count);
    this.#allocations += count;
  }
  public recordCache(statistics: CacheStatistics): void {
    this.#cacheHits += statistics.hits;
    this.#cacheMisses += statistics.misses;
  }
  public snapshot(): InteractionPerformanceSnapshot {
    const cacheRequests = this.#cacheHits + this.#cacheMisses;
    const averageFrame = this.#frames === 0 ? 0 : this.#frameTime / this.#frames;
    return Object.freeze({
      eventCount: this.#events,
      averageEventLatency: this.#events === 0 ? 0 : this.#latency / this.#events,
      averageDispatchDuration: this.#events === 0 ? 0 : this.#dispatch / this.#events,
      averageSchedulerDuration: this.#frames === 0 ? 0 : this.#scheduler / this.#frames,
      cacheHitRatio: cacheRequests === 0 ? 0 : this.#cacheHits / cacheRequests,
      allocationCount: this.#allocations,
      averageFrameTime: averageFrame,
      maximumQueueLength: this.#maximumQueue,
      interactionFps: averageFrame === 0 ? 0 : 1_000 / averageFrame,
      droppedFrames: this.#dropped
    });
  }
  public dispose(): void {
    this.#disposed = true;
  }
  #validate(...values: readonly number[]): void {
    if (this.#disposed)
      throw new PerformanceError("PERFORMANCE_DISPOSED", "Performance metrics are disposed.");
    if (values.some((value) => !Number.isFinite(value) || value < 0))
      throw new PerformanceError(
        "PERFORMANCE_SAMPLE_INVALID",
        "Performance samples must be finite and non-negative."
      );
  }
}

export interface PerformanceDashboardAdapter {
  update(snapshot: Readonly<InteractionPerformanceSnapshot>): void;
  clear(): void;
}

export class PerformanceDiagnosticsController {
  public constructor(
    private readonly metrics: InteractionPerformanceMetrics,
    private readonly adapter?: PerformanceDashboardAdapter
  ) {}
  public publish(): InteractionPerformanceSnapshot {
    const snapshot = this.metrics.snapshot();
    this.adapter?.update(snapshot);
    return snapshot;
  }
  public dispose(): void {
    this.adapter?.clear();
    this.metrics.dispose();
  }
}
