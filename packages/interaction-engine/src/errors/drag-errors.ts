import { InteractionError } from "./base.js";

export type DragErrorCode =
  | "DRAG_ALREADY_ACTIVE"
  | "DRAG_NOT_ACTIVE"
  | "DRAG_DISPOSED"
  | "DRAG_POINTER_MISMATCH"
  | "DRAG_EMPTY_SELECTION"
  | "DRAG_POLICY_REJECTED";
export type TransformErrorCode = "TRANSFORM_INVALID_DELTA";
export type ConstraintErrorCode = "CONSTRAINT_REJECTED";

export class DragError extends InteractionError {
  public override readonly name = "DragError";
  public constructor(code: DragErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
export class TransformError extends InteractionError {
  public override readonly name = "TransformError";
  public constructor(code: TransformErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
export class ConstraintError extends InteractionError {
  public override readonly name = "ConstraintError";
  public constructor(code: ConstraintErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
