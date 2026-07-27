import type { DragPolicy, DragPolicyContext, DragValidationResult } from "../types/drag.js";

export class MovablePolicy implements DragPolicy {
  public readonly id = "movable";
  public validate({ nodes, draggedIds }: Readonly<DragPolicyContext>): DragValidationResult {
    return nodes.length === draggedIds.length && nodes.every(({ visible }) => visible !== false)
      ? { allowed: true }
      : {
          allowed: false,
          code: "DRAG_NOT_MOVABLE",
          message: "Every dragged node must be movable."
        };
  }
}

export class DisabledDragPolicy implements DragPolicy {
  public readonly id = "disabled";
  public validate(): DragValidationResult {
    return { allowed: false, code: "DRAG_DISABLED", message: "Dragging is disabled." };
  }
}

export class CustomDragPolicy implements DragPolicy {
  public constructor(
    public readonly id: string,
    private readonly validator: (context: Readonly<DragPolicyContext>) => DragValidationResult
  ) {}
  public validate(context: Readonly<DragPolicyContext>): DragValidationResult {
    return this.validator(context);
  }
}

export function validateDragPolicies(
  policies: readonly DragPolicy[],
  context: Readonly<DragPolicyContext>
): DragValidationResult {
  for (const policy of policies) {
    const result = policy.validate(context);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
export * from "./focus-policies.js";
export * from "./accessibility-policies.js";
