import { InteractionError } from "./base.js";

export type AccessibilityErrorCode =
  | "ACCESSIBILITY_DISPOSED"
  | "ACCESSIBILITY_NODE_DUPLICATE"
  | "ACCESSIBILITY_PARENT_MISSING"
  | "ACCESSIBILITY_TREE_INVALID";
export type AriaErrorCode = "ARIA_ROLE_INVALID" | "ARIA_METADATA_INVALID";
export type ScreenReaderErrorCode = "SCREEN_READER_DISPOSED" | "SCREEN_READER_DELIVERY_FAILED";
export type AnnouncementErrorCode =
  "ANNOUNCEMENT_DISPOSED" | "ANNOUNCEMENT_INVALID" | "ANNOUNCEMENT_DUPLICATE";

export class AccessibilityError extends InteractionError {
  public override readonly name = "AccessibilityError";
  public constructor(code: AccessibilityErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
export class AriaError extends InteractionError {
  public override readonly name = "AriaError";
  public constructor(code: AriaErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
export class ScreenReaderError extends InteractionError {
  public override readonly name = "ScreenReaderError";
  public constructor(code: ScreenReaderErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "recoverable", options);
  }
}
export class AnnouncementError extends InteractionError {
  public override readonly name = "AnnouncementError";
  public constructor(code: AnnouncementErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
