export interface SelectionDiagnosticSnapshot {
  readonly enabled: boolean;
  readonly selectionCount: number;
  readonly revision: number;
  readonly transitionCount: number;
  readonly observerCount: number;
  readonly eventCount: number;
}

export class SelectionDiagnostics {
  #transitions = 0;
  #events = 0;
  public constructor(public readonly enabled = false) {}
  public recordTransition(eventCount: number): void {
    if (!this.enabled) return;
    this.#transitions++;
    this.#events += eventCount;
  }
  public snapshot(
    selectionCount: number,
    revision: number,
    observerCount: number
  ): SelectionDiagnosticSnapshot {
    return Object.freeze({
      enabled: this.enabled,
      selectionCount,
      revision,
      transitionCount: this.#transitions,
      observerCount,
      eventCount: this.#events
    });
  }
}
