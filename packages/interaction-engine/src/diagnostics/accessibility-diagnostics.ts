export interface AccessibilityDiagnosticSnapshot {
  readonly enabled: boolean;
  readonly focusChanges: number;
  readonly announcements: number;
  readonly treeUpdates: number;
  readonly ariaGenerations: number;
  readonly roleGenerations: number;
  readonly liveRegionEvents: number;
}
export class AccessibilityDiagnostics {
  #focus = 0;
  #announcements = 0;
  #tree = 0;
  #aria = 0;
  #roles = 0;
  #live = 0;
  public constructor(public readonly enabled = false) {}
  public recordFocus(): void {
    if (this.enabled) this.#focus++;
  }
  public recordAnnouncement(): void {
    if (this.enabled) this.#announcements++;
  }
  public recordTreeUpdate(): void {
    if (this.enabled) this.#tree++;
  }
  public recordAria(count = 1): void {
    if (this.enabled) this.#aria += count;
  }
  public recordRole(count = 1): void {
    if (this.enabled) this.#roles += count;
  }
  public recordLiveRegion(): void {
    if (this.enabled) this.#live++;
  }
  public snapshot(): AccessibilityDiagnosticSnapshot {
    return Object.freeze({
      enabled: this.enabled,
      focusChanges: this.#focus,
      announcements: this.#announcements,
      treeUpdates: this.#tree,
      ariaGenerations: this.#aria,
      roleGenerations: this.#roles,
      liveRegionEvents: this.#live
    });
  }
}
