export interface InteractionDiagnosticSnapshot {
  readonly enabled: boolean;
  readonly eventCount: number;
  readonly activeListeners: number;
  readonly totalDispatchTime: number;
  readonly queueSize: number;
  readonly sessionState?: string;
}
export class InteractionDiagnostics {
  #eventCount = 0;
  #totalDispatchTime = 0;
  public constructor(
    public readonly enabled = false,
    private readonly now: () => number = () => Date.now()
  ) {}
  public beginDispatch(): number | undefined {
    return this.enabled ? this.now() : undefined;
  }
  public endDispatch(started?: number): void {
    if (!this.enabled || started === undefined) return;
    this.#eventCount++;
    this.#totalDispatchTime += Math.max(0, this.now() - started);
  }
  public snapshot(
    activeListeners = 0,
    queueSize = 0,
    sessionState?: string
  ): InteractionDiagnosticSnapshot {
    return Object.freeze({
      enabled: this.enabled,
      eventCount: this.#eventCount,
      activeListeners,
      totalDispatchTime: this.#totalDispatchTime,
      queueSize,
      ...(sessionState === undefined ? {} : { sessionState })
    });
  }
  public reset(): void {
    this.#eventCount = 0;
    this.#totalDispatchTime = 0;
  }
}
export * from "./drag-diagnostics.js";
export * from "./keyboard-diagnostics.js";
export * from "./accessibility-diagnostics.js";
