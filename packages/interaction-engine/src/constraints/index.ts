import type { DragConstraint, DragConstraintContext, DragValidationResult } from "../types/drag.js";

export class MinimumMovementConstraint implements DragConstraint {
  public readonly id = "minimum-movement";
  public constructor(public readonly threshold = 3) {}
  public evaluate({ delta }: Readonly<DragConstraintContext>): DragValidationResult {
    return Math.hypot(delta.x, delta.y) >= this.threshold
      ? { allowed: true }
      : {
          allowed: false,
          code: "DRAG_BELOW_THRESHOLD",
          message: `Movement must be at least ${this.threshold}.`
        };
  }
}

export class LockedNodeConstraint implements DragConstraint {
  public readonly id = "locked-node";
  public evaluate({ nodes }: Readonly<DragConstraintContext>): DragValidationResult {
    return nodes.some(({ locked }) => locked === true)
      ? { allowed: false, code: "DRAG_NODE_LOCKED", message: "Locked nodes cannot be moved." }
      : { allowed: true };
  }
}

export class HiddenLayerConstraint implements DragConstraint {
  public readonly id = "hidden-layer";
  public constructor(private readonly isLayerVisible: (layerId: string) => boolean) {}
  public evaluate({ nodes }: Readonly<DragConstraintContext>): DragValidationResult {
    return nodes.some(({ layerId }) => layerId !== undefined && !this.isLayerVisible(layerId))
      ? {
          allowed: false,
          code: "DRAG_LAYER_HIDDEN",
          message: "Nodes on hidden layers cannot be moved."
        }
      : { allowed: true };
  }
}

export class ReadOnlyConstraint implements DragConstraint {
  public readonly id = "read-only";
  public evaluate({ readOnly }: Readonly<DragConstraintContext>): DragValidationResult {
    return readOnly
      ? { allowed: false, code: "DRAG_READ_ONLY", message: "The document is read-only." }
      : { allowed: true };
  }
}

export class CompositeDragConstraint implements DragConstraint {
  public readonly id = "composite";
  public constructor(private readonly constraints: readonly DragConstraint[]) {}
  public evaluate(context: Readonly<DragConstraintContext>): DragValidationResult {
    for (const constraint of this.constraints) {
      const result = constraint.evaluate(context);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }
}
