import { NO_MODIFIERS } from "../events/index.js";
import type { KeyboardState } from "../types/keyboard.js";

export function createKeyboardState(state: Partial<KeyboardState> = {}): KeyboardState {
  return Object.freeze({
    pressedKeys: new Set(state.pressedKeys ?? []),
    modifiers: Object.freeze({ ...(state.modifiers ?? NO_MODIFIERS) }),
    repeat: state.repeat ?? false,
    timestamp: state.timestamp ?? 0,
    composing: state.composing ?? false,
    revision: state.revision ?? 0,
    ...(state.activeKey === undefined ? {} : { activeKey: state.activeKey }),
    ...(state.navigationDirection === undefined
      ? {}
      : { navigationDirection: state.navigationDirection }),
    ...(state.focusTarget === undefined ? {} : { focusTarget: state.focusTarget })
  });
}

export const EMPTY_KEYBOARD_STATE = createKeyboardState();
