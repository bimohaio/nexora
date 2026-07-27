import type { SelectionManager } from "../selection/manager/index.js";
import { KeyboardDiagnostics } from "../diagnostics/keyboard-diagnostics.js";
import { NavigationError } from "../errors/index.js";
import type { FocusEngine } from "../focus/index.js";
import type { FocusState, NavigationDirection } from "../types/keyboard.js";

export interface NavigationEngineOptions {
  readonly selection?: SelectionManager;
  readonly diagnostics?: KeyboardDiagnostics;
  readonly selectFocused?: boolean;
}

export class NavigationEngine {
  readonly #diagnostics: KeyboardDiagnostics;
  #disposed = false;
  public constructor(
    private readonly focus: FocusEngine,
    private readonly options: NavigationEngineOptions = {}
  ) {
    this.#diagnostics = options.diagnostics ?? new KeyboardDiagnostics();
  }
  public navigate(direction: NavigationDirection): FocusState {
    if (this.#disposed)
      throw new NavigationError("NAVIGATION_DISPOSED", "Navigation engine is disposed.");
    const state = this.focus.traverse(direction);
    if (this.options.selectFocused !== false && state.target !== undefined)
      this.options.selection?.select(state.target, "replace", "keyboard");
    this.#diagnostics.recordNavigation();
    return state;
  }
  public dispose(): void {
    this.#disposed = true;
  }
}
