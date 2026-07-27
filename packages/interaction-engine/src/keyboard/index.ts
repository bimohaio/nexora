import { KeyboardDiagnostics } from "../diagnostics/keyboard-diagnostics.js";
import { KeyboardDispatcher } from "../dispatcher/keyboard-dispatcher.js";
import { KeyboardError } from "../errors/index.js";
import type { FocusEngine } from "../focus/index.js";
import { KeyMap } from "../maps/index.js";
import type { NavigationEngine } from "../navigation/index.js";
import { KeyboardCommandRouter } from "../routing/index.js";
import { createKeyboardState } from "../state/keyboard-state.js";
import type {
  FocusTarget,
  KeyboardCommand,
  KeyboardInput,
  KeyboardRenderAdapter,
  KeyboardState,
  NavigationDirection,
  NormalizedKey
} from "../types/keyboard.js";
import { completeModifiers, normalizeKeyName } from "../utils/keyboard-utils.js";

const DIRECTIONS: Readonly<Partial<Record<KeyboardCommand, NavigationDirection>>> = {
  "navigate-next": "next",
  "navigate-previous": "previous",
  "navigate-parent": "parent",
  "navigate-child": "child",
  "navigate-first": "first",
  "navigate-last": "last",
  "navigate-page-up": "page-up",
  "navigate-page-down": "page-down"
};

export interface KeyboardEngineOptions {
  readonly focus: FocusEngine;
  readonly navigation: NavigationEngine;
  readonly keyMap?: KeyMap;
  readonly router?: KeyboardCommandRouter;
  readonly dispatcher?: KeyboardDispatcher;
  readonly renderer?: KeyboardRenderAdapter;
  readonly diagnostics?: KeyboardDiagnostics;
  readonly interactionActive?: () => boolean;
  readonly onActivate?: (target: FocusTarget) => void;
  readonly onToggleSelection?: (target: FocusTarget) => void;
  readonly onEscape?: () => void;
  readonly onFocusChanged?: (target: FocusTarget | undefined) => void;
}

export class KeyboardEngine {
  readonly #focus: FocusEngine;
  readonly #navigation: NavigationEngine;
  readonly #router: KeyboardCommandRouter;
  readonly #dispatcher: KeyboardDispatcher;
  readonly #diagnostics: KeyboardDiagnostics;
  readonly #renderer: KeyboardRenderAdapter | undefined;
  readonly #interactionActive: () => boolean;
  #state = createKeyboardState();
  #disposed = false;

  public constructor(private readonly options: KeyboardEngineOptions) {
    this.#focus = options.focus;
    this.#navigation = options.navigation;
    this.#diagnostics = options.diagnostics ?? new KeyboardDiagnostics();
    this.#dispatcher = options.dispatcher ?? new KeyboardDispatcher();
    this.#renderer = options.renderer;
    this.#interactionActive = options.interactionActive ?? (() => false);
    this.#router =
      options.router ??
      new KeyboardCommandRouter(options.keyMap ?? new KeyMap(), {
        diagnostics: this.#diagnostics
      });
    for (const command of Object.keys(DIRECTIONS) as KeyboardCommand[]) {
      const direction = DIRECTIONS[command];
      if (direction === undefined) continue;
      this.#router.register(command, () => {
        const focus = this.#navigation.navigate(direction);
        this.#state = createKeyboardState({
          ...this.#state,
          navigationDirection: direction,
          ...(focus.target === undefined ? {} : { focusTarget: focus.target }),
          revision: this.#state.revision + 1
        });
        this.#dispatcher.dispatch({ type: "navigation-completed", direction, focus });
        return true;
      });
    }
    this.#router.register("activate", () => {
      if (this.#focus.state.target === undefined) return false;
      options.onActivate?.(this.#focus.state.target);
      return true;
    });
    this.#router.register("toggle-selection", () => {
      if (this.#focus.state.target === undefined) return false;
      options.onToggleSelection?.(this.#focus.state.target);
      return true;
    });
    this.#router.register("escape", () => {
      this.#focus.focus(undefined);
      options.onEscape?.();
      return true;
    });
  }

  public get state(): KeyboardState {
    return this.#state;
  }
  public get dispatcher(): KeyboardDispatcher {
    return this.#dispatcher;
  }
  public setTargets(targets: readonly FocusTarget[]): void {
    const focus = this.#focus.setTargets(targets);
    this.#syncFocus(focus.target);
  }
  public process(input: Readonly<KeyboardInput>): KeyboardState {
    this.#assertUsable();
    if (!Number.isFinite(input.timestamp))
      throw new KeyboardError("KEYBOARD_INPUT_INVALID", "Keyboard timestamp must be finite.");
    if (input.type === "composition-start" || input.type === "composition-end") {
      this.#state = createKeyboardState({
        ...this.#state,
        composing: input.type === "composition-start",
        timestamp: input.timestamp,
        revision: this.#state.revision + 1
      });
      this.#render();
      return this.#state;
    }
    if (input.type === "modifier-change") {
      this.#state = createKeyboardState({
        ...this.#state,
        modifiers: completeModifiers(input.modifiers),
        timestamp: input.timestamp,
        revision: this.#state.revision + 1
      });
      this.#render();
      return this.#state;
    }
    if (input.key === undefined)
      throw new KeyboardError("KEYBOARD_INPUT_INVALID", "Key input requires a key.");
    const key = normalizeKeyName(input.key);
    const modifiers = completeModifiers(input.modifiers);
    const normalized: NormalizedKey = Object.freeze({
      key,
      code: input.code ?? key,
      repeat: input.repeat ?? false,
      timestamp: input.timestamp,
      modifiers,
      composing: this.#state.composing
    });
    const pressed = new Set(this.#state.pressedKeys);
    if (input.type === "key-down") pressed.add(key);
    else pressed.delete(key);
    const { activeKey: previousActiveKey, ...stateWithoutActiveKey } = this.#state;
    void previousActiveKey;
    this.#state = createKeyboardState({
      ...stateWithoutActiveKey,
      pressedKeys: pressed,
      modifiers,
      timestamp: input.timestamp,
      repeat: normalized.repeat,
      revision: this.#state.revision + 1,
      ...(input.type === "key-down" ? { activeKey: key } : {})
    });
    this.#diagnostics.recordKey(normalized.repeat, modifiers);
    this.#dispatcher.dispatch({
      type: input.type === "key-down" ? "key-pressed" : "key-released",
      key: normalized,
      state: this.#state
    });
    if (input.type === "key-down") this.#route(normalized);
    this.#render();
    return this.#state;
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#router.dispose();
    this.#navigation.dispose();
    this.#focus.dispose();
    this.#dispatcher.dispose();
    this.#renderer?.clearKeyboardState();
    this.#state = createKeyboardState({ revision: this.#state.revision + 1 });
    this.#disposed = true;
  }
  #route(key: NormalizedKey): void {
    const command = this.#router.resolve(key);
    const direction = command === undefined ? undefined : DIRECTIONS[command];
    if (direction !== undefined)
      this.#dispatcher.dispatch({ type: "navigation-started", direction, state: this.#state });
    const result = this.#router.route(key, {
      state: this.#state,
      ...(this.#focus.state.target === undefined ? {} : { focus: this.#focus.state.target }),
      interactionActive: this.#interactionActive()
    });
    if (!result.handled || result.command === undefined) return;
    if (result.command === "escape")
      this.#dispatcher.dispatch({ type: "escape-pressed", state: this.#state });
    this.#dispatcher.dispatch({ type: "command-triggered", command: result.command });
    this.#syncFocus(this.#focus.state.target);
  }
  #syncFocus(target: FocusTarget | undefined): void {
    const { focusTarget: previousFocus, ...withoutFocus } = this.#state;
    void previousFocus;
    this.#state = createKeyboardState({
      ...withoutFocus,
      ...(target === undefined ? {} : { focusTarget: target }),
      revision: this.#state.revision + 1
    });
    this.options.onFocusChanged?.(target);
    this.#dispatcher.dispatch({ type: "focus-changed", focus: this.#focus.state });
    this.#render();
  }
  #render(): void {
    this.#renderer?.updateKeyboardState({
      keyboard: this.#state,
      focus: this.#focus.state,
      ...(this.#state.navigationDirection === undefined
        ? {}
        : { navigationDirection: this.#state.navigationDirection })
    });
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new KeyboardError("KEYBOARD_DISPOSED", "Keyboard engine is disposed.");
  }
}
