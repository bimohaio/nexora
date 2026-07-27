import { InteractionError } from "./base.js";

export type KeyboardErrorCode =
  "KEYBOARD_DISPOSED" | "KEYBOARD_INPUT_INVALID" | "KEYBOARD_DUPLICATE_DOWN";
export type NavigationErrorCode = "NAVIGATION_DISPOSED" | "NAVIGATION_TARGET_INVALID";
export type FocusErrorCode = "FOCUS_DISPOSED" | "FOCUS_TARGET_INVALID";
export type CommandRoutingErrorCode = "COMMAND_ROUTER_DISPOSED" | "COMMAND_ROUTE_INVALID";

export class KeyboardError extends InteractionError {
  public override readonly name = "KeyboardError";
  public constructor(code: KeyboardErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class NavigationError extends InteractionError {
  public override readonly name = "NavigationError";
  public constructor(code: NavigationErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class FocusError extends InteractionError {
  public override readonly name = "FocusError";
  public constructor(code: FocusErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class CommandRoutingError extends InteractionError {
  public override readonly name = "CommandRoutingError";
  public constructor(code: CommandRoutingErrorCode, message: string) {
    super(code, message, "validation");
  }
}
