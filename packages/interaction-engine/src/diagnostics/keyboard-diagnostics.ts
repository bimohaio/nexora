import type { InteractionModifiers } from "../events/index.js";
import { NO_MODIFIERS } from "../events/index.js";

export interface KeyboardDiagnosticSnapshot {
  readonly enabled: boolean;
  readonly keyEvents: number;
  readonly navigationCount: number;
  readonly focusChanges: number;
  readonly commandRoutes: number;
  readonly repeatCount: number;
  readonly activeModifiers: InteractionModifiers;
}

export class KeyboardDiagnostics {
  #keys = 0;
  #navigation = 0;
  #focus = 0;
  #routes = 0;
  #repeats = 0;
  #modifiers: InteractionModifiers = NO_MODIFIERS;
  public constructor(public readonly enabled = false) {}
  public recordKey(repeat: boolean, modifiers: InteractionModifiers): void {
    if (!this.enabled) return;
    this.#keys++;
    if (repeat) this.#repeats++;
    this.#modifiers = modifiers;
  }
  public recordNavigation(): void {
    if (this.enabled) this.#navigation++;
  }
  public recordFocus(): void {
    if (this.enabled) this.#focus++;
  }
  public recordRoute(): void {
    if (this.enabled) this.#routes++;
  }
  public snapshot(): KeyboardDiagnosticSnapshot {
    return Object.freeze({
      enabled: this.enabled,
      keyEvents: this.#keys,
      navigationCount: this.#navigation,
      focusChanges: this.#focus,
      commandRoutes: this.#routes,
      repeatCount: this.#repeats,
      activeModifiers: this.#modifiers
    });
  }
}
