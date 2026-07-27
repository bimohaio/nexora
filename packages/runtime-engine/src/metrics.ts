export interface RuntimeMetricsSnapshot {
  readonly totalUpdates: number;
  readonly failedUpdates: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly activeSubscriptions: number;
  readonly schedulerLatencyMs: number;
  readonly dispatchDurationMs: number;
  readonly averageResolveTimeMs: number;
  readonly minimumLatencyMs: number;
  readonly maximumLatencyMs: number;
  readonly averageLatencyMs: number;
  readonly dispatchCount: number;
  readonly frameDurationMs: number;
  readonly snapshotCount: number;
  readonly cacheHitRatio: number;
  readonly memoryUsageBytes: number;
}

export class RuntimeMetrics {
  #totalUpdates = 0;
  #failedUpdates = 0;
  #warningCount = 0;
  #errorCount = 0;
  #schedulerLatencyMs = 0;
  #dispatchDurationMs = 0;
  #resolveTotalMs = 0;
  #resolveCount = 0;
  #latencyTotalMs = 0;
  #latencyCount = 0;
  #minimumLatencyMs = 0;
  #maximumLatencyMs = 0;
  #dispatchCount = 0;
  #frameDurationMs = 0;
  #snapshotCount = 0;
  #cacheHits = 0;
  #cacheMisses = 0;
  #memoryUsageBytes = 0;
  #revision = 0;
  #cached:
    | {
        readonly revision: number;
        readonly subscriptions: number;
        readonly value: RuntimeMetricsSnapshot;
      }
    | undefined;

  public recordUpdate(failed = false): void {
    this.#totalUpdates += 1;
    if (failed) this.#failedUpdates += 1;
    this.#touch();
  }
  public recordWarning(): void {
    this.#warningCount += 1;
    this.#touch();
  }
  public recordError(): void {
    this.#errorCount += 1;
    this.#touch();
  }
  public recordSchedulerLatency(milliseconds: number): void {
    this.#schedulerLatencyMs = finiteDuration(milliseconds);
    this.#recordLatency(milliseconds);
  }
  public recordDispatchDuration(milliseconds: number): void {
    this.#dispatchDurationMs = finiteDuration(milliseconds);
    this.#dispatchCount += 1;
    this.#recordLatency(milliseconds);
  }
  public recordResolveDuration(milliseconds: number): void {
    this.#resolveTotalMs += finiteDuration(milliseconds);
    this.#resolveCount += 1;
    this.#recordLatency(milliseconds);
  }
  public recordFrameDuration(milliseconds: number): void {
    this.#frameDurationMs = finiteDuration(milliseconds);
    this.#recordLatency(milliseconds);
  }
  public recordSnapshot(): void {
    this.#snapshotCount += 1;
    this.#touch();
  }
  public recordCacheAccess(hit: boolean): void {
    if (hit) this.#cacheHits += 1;
    else this.#cacheMisses += 1;
    this.#touch();
  }
  public recordMemoryUsage(bytes: number): void {
    this.#memoryUsageBytes = Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0;
    this.#touch();
  }
  public snapshot(activeSubscriptions = 0): RuntimeMetricsSnapshot {
    if (
      this.#cached?.revision === this.#revision &&
      this.#cached.subscriptions === activeSubscriptions
    )
      return this.#cached.value;
    const cacheAccesses = this.#cacheHits + this.#cacheMisses;
    const value = Object.freeze({
      totalUpdates: this.#totalUpdates,
      failedUpdates: this.#failedUpdates,
      warningCount: this.#warningCount,
      errorCount: this.#errorCount,
      activeSubscriptions,
      schedulerLatencyMs: this.#schedulerLatencyMs,
      dispatchDurationMs: this.#dispatchDurationMs,
      averageResolveTimeMs:
        this.#resolveCount === 0 ? 0 : this.#resolveTotalMs / this.#resolveCount,
      minimumLatencyMs: this.#minimumLatencyMs,
      maximumLatencyMs: this.#maximumLatencyMs,
      averageLatencyMs: this.#latencyCount === 0 ? 0 : this.#latencyTotalMs / this.#latencyCount,
      dispatchCount: this.#dispatchCount,
      frameDurationMs: this.#frameDurationMs,
      snapshotCount: this.#snapshotCount,
      cacheHitRatio: cacheAccesses === 0 ? 0 : this.#cacheHits / cacheAccesses,
      memoryUsageBytes: this.#memoryUsageBytes
    });
    this.#cached = { revision: this.#revision, subscriptions: activeSubscriptions, value };
    return value;
  }

  #recordLatency(milliseconds: number): void {
    const value = finiteDuration(milliseconds);
    this.#latencyTotalMs += value;
    this.#latencyCount += 1;
    this.#minimumLatencyMs =
      this.#latencyCount === 1 ? value : Math.min(this.#minimumLatencyMs, value);
    this.#maximumLatencyMs = Math.max(this.#maximumLatencyMs, value);
    this.#touch();
  }
  #touch(): void {
    this.#revision += 1;
    this.#cached = undefined;
  }
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
