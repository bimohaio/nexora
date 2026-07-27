import { distanceBetweenPoints, type Point } from "@web-scada/geometry";
import { TransformError } from "../errors/index.js";
import type {
  DragConstraint,
  DragConstraintContext,
  DragValidationResult,
  TemporaryMoveTransform
} from "../types/drag.js";

export function movementDelta(initial: Point, current: Point): Point {
  const delta = { x: current.x - initial.x, y: current.y - initial.y };
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new TransformError("TRANSFORM_INVALID_DELTA", "Movement delta must be finite.");
  return delta;
}

export interface TransformPipelineResult {
  readonly delta: Point;
  readonly distance: number;
  readonly validation: DragValidationResult;
  readonly transform?: TemporaryMoveTransform;
}

export class TransformPipeline {
  public constructor(private readonly constraints: readonly DragConstraint[] = []) {}

  public calculate(
    context: Omit<DragConstraintContext, "delta">,
    revision: number
  ): TransformPipelineResult {
    const delta = movementDelta(context.initialPointer, context.currentPointer);
    const fullContext: DragConstraintContext = { ...context, delta };
    for (const constraint of this.constraints) {
      const validation = constraint.evaluate(fullContext);
      if (!validation.allowed)
        return { delta, distance: distanceBetweenPoints({ x: 0, y: 0 }, delta), validation };
    }
    return {
      delta,
      distance: distanceBetweenPoints({ x: 0, y: 0 }, delta),
      validation: { allowed: true },
      transform: Object.freeze({
        kind: "move",
        delta: Object.freeze(delta),
        nodeIds: Object.freeze([...context.draggedIds]),
        revision
      })
    };
  }
}
