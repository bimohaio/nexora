export interface BrowserDemoDiagnosticsSnapshot {
  readonly fps: number;
  readonly averageRenderTimeMs: number;
  readonly dirtyObjects: number;
  readonly runtimeRevision: number;
  readonly activeAnimations: number;
  readonly activeAlarms: number;
  readonly memoryCounters: number;
  readonly rendererInstances: number;
}

/** Demo telemetry only; it observes public events and never participates in engine decisions. */
export class BrowserDemoDiagnostics {
  readonly #renderSamples: number[] = [];
  readonly #frameTimes: number[] = [];
  #renderStartedAt: number | undefined;
  #dirtyObjects = 0;
  #runtimeRevision = 0;
  #activeAnimations = 0;
  #activeAlarms = 0;
  #memoryCounters = 0;
  #rendererInstances = 0;

  public renderStarted(timestamp: number): void {
    this.#renderStartedAt = timestamp;
  }

  public renderCompleted(timestamp: number): void {
    if (this.#renderStartedAt !== undefined)
      this.#push(this.#renderSamples, Math.max(0, timestamp - this.#renderStartedAt), 120);
    this.#renderStartedAt = undefined;
    this.#push(this.#frameTimes, timestamp, 120);
  }

  public update(values: {
    readonly dirtyObjects?: number;
    readonly runtimeRevision?: number;
    readonly activeAnimations?: number;
    readonly activeAlarms?: number;
    readonly memoryCounters?: number;
    readonly rendererInstances?: number;
  }): void {
    if (values.dirtyObjects !== undefined) this.#dirtyObjects = values.dirtyObjects;
    if (values.runtimeRevision !== undefined) this.#runtimeRevision = values.runtimeRevision;
    if (values.activeAnimations !== undefined) this.#activeAnimations = values.activeAnimations;
    if (values.activeAlarms !== undefined) this.#activeAlarms = values.activeAlarms;
    if (values.memoryCounters !== undefined) this.#memoryCounters = values.memoryCounters;
    if (values.rendererInstances !== undefined) this.#rendererInstances = values.rendererInstances;
  }

  public snapshot(): BrowserDemoDiagnosticsSnapshot {
    const first = this.#frameTimes[0];
    const last = this.#frameTimes.at(-1);
    const elapsed = first === undefined || last === undefined ? 0 : last - first;
    const fps = elapsed <= 0 ? 0 : Math.round(((this.#frameTimes.length - 1) * 1000) / elapsed);
    const renderTotal = this.#renderSamples.reduce((sum, value) => sum + value, 0);
    return Object.freeze({
      fps,
      averageRenderTimeMs:
        this.#renderSamples.length === 0 ? 0 : renderTotal / this.#renderSamples.length,
      dirtyObjects: this.#dirtyObjects,
      runtimeRevision: this.#runtimeRevision,
      activeAnimations: this.#activeAnimations,
      activeAlarms: this.#activeAlarms,
      memoryCounters: this.#memoryCounters,
      rendererInstances: this.#rendererInstances
    });
  }

  #push(target: number[], value: number, limit: number): void {
    target.push(value);
    if (target.length > limit) target.splice(0, target.length - limit);
  }
}
