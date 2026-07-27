import { InteractionError } from "./base.js";

export type PointerErrorCode = "POINTER_DISPOSED" | "POINTER_EVENT_INVALID";
export type CoordinateErrorCode =
  "COORDINATE_INVALID" | "COORDINATE_TRANSFORM_MISSING" | "COORDINATE_TRANSFORM_INVALID";
export type HitTestErrorCode = "HIT_TEST_DISPOSED" | "HIT_TEST_QUERY_INVALID";

export class PointerError extends InteractionError {
  public override readonly name = "PointerError";
  public constructor(code: PointerErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class CoordinateError extends InteractionError {
  public override readonly name = "CoordinateError";
  public constructor(code: CoordinateErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, "validation", options);
  }
}
export class HitTestError extends InteractionError {
  public override readonly name = "HitTestError";
  public constructor(code: HitTestErrorCode, message: string) {
    super(code, message, "validation");
  }
}
