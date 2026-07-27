import type {
  FocusState,
  KeyboardCommand,
  KeyboardState,
  NavigationDirection,
  NormalizedKey
} from "../types/keyboard.js";

export type KeyboardEvent =
  | { readonly type: "key-pressed"; readonly key: NormalizedKey; readonly state: KeyboardState }
  | { readonly type: "key-released"; readonly key: NormalizedKey; readonly state: KeyboardState }
  | {
      readonly type: "navigation-started";
      readonly direction: NavigationDirection;
      readonly state: KeyboardState;
    }
  | {
      readonly type: "navigation-completed";
      readonly direction: NavigationDirection;
      readonly focus: FocusState;
    }
  | { readonly type: "focus-changed"; readonly focus: FocusState }
  | { readonly type: "command-triggered"; readonly command: KeyboardCommand }
  | { readonly type: "escape-pressed"; readonly state: KeyboardState };

export type KeyboardEventListener = (event: Readonly<KeyboardEvent>) => void;
