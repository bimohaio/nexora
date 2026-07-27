import type { InteractionModifiers } from "../events/index.js";
import type { InteractionTarget } from "./index.js";

export type KeyboardInputType =
  "key-down" | "key-up" | "composition-start" | "composition-end" | "modifier-change";
export type NavigationDirection =
  "next" | "previous" | "parent" | "child" | "first" | "last" | "page-up" | "page-down";

export interface KeyboardInput {
  readonly type: KeyboardInputType;
  readonly key?: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly timestamp: number;
  readonly modifiers?: Partial<InteractionModifiers>;
}

export interface NormalizedKey {
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly timestamp: number;
  readonly modifiers: InteractionModifiers;
  readonly composing: boolean;
}

export interface KeyboardState {
  readonly pressedKeys: ReadonlySet<string>;
  readonly modifiers: InteractionModifiers;
  readonly activeKey?: string;
  readonly repeat: boolean;
  readonly timestamp: number;
  readonly navigationDirection?: NavigationDirection;
  readonly focusTarget?: InteractionTarget;
  readonly composing: boolean;
  readonly revision: number;
}

export interface FocusTarget extends InteractionTarget {
  readonly parentId?: string;
  readonly order?: number;
  readonly hidden?: boolean;
  readonly locked?: boolean;
  readonly disabled?: boolean;
  readonly layerId?: string;
}

export interface FocusPolicyContext {
  readonly readOnly: boolean;
}

export interface FocusPolicy {
  readonly id: string;
  allows(target: Readonly<FocusTarget>, context: Readonly<FocusPolicyContext>): boolean;
}

export interface FocusState {
  readonly target?: FocusTarget;
  readonly order: readonly string[];
  readonly revision: number;
}

export type KeyboardCommand =
  | "navigate-next"
  | "navigate-previous"
  | "navigate-parent"
  | "navigate-child"
  | "navigate-first"
  | "navigate-last"
  | "navigate-page-up"
  | "navigate-page-down"
  | "activate"
  | "toggle-selection"
  | "escape"
  | (string & {});

export interface KeyBinding {
  readonly key: string;
  readonly command: KeyboardCommand;
  readonly platform?: "mac" | "windows" | "linux" | "all";
}

export interface CommandRouteContext {
  readonly state: KeyboardState;
  readonly focus?: FocusTarget;
  readonly interactionActive: boolean;
}

export interface CommandRouteResult {
  readonly handled: boolean;
  readonly command?: KeyboardCommand;
}

export interface KeyboardRenderState {
  readonly keyboard: KeyboardState;
  readonly focus: FocusState;
  readonly navigationDirection?: NavigationDirection;
}

export interface KeyboardRenderAdapter {
  updateKeyboardState(state: Readonly<KeyboardRenderState>): void;
  clearKeyboardState(): void;
}
