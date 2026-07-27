import type {
  AccessibilityNode,
  AccessibilityPolicy,
  AccessibilityPolicyContext
} from "../types/accessibility.js";

export class HiddenAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-hidden";
  public includes(node: Readonly<AccessibilityNode>): boolean {
    return node.visible;
  }
}
export class DisabledAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-disabled";
  public constructor(private readonly includeDisabled = true) {}
  public includes(node: Readonly<AccessibilityNode>): boolean {
    return this.includeDisabled || node.state.disabled !== true;
  }
}
export class LockedAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-locked";
  public constructor(private readonly includeLocked = true) {}
  public includes(node: Readonly<AccessibilityNode>): boolean {
    return this.includeLocked || node.state.locked !== true;
  }
}
export class DecorativeAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-decorative";
  public includes(node: Readonly<AccessibilityNode>): boolean {
    return node.state.decorative !== true;
  }
}
export class ReadOnlyAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-read-only";
  public includes(
    node: Readonly<AccessibilityNode>,
    context: Readonly<AccessibilityPolicyContext>
  ): boolean {
    return !context.readOnly || node.state.readOnly !== false;
  }
}
export class CustomAccessibilityPolicy implements AccessibilityPolicy {
  public constructor(
    public readonly id: string,
    private readonly filter: (
      node: Readonly<AccessibilityNode>,
      context: Readonly<AccessibilityPolicyContext>
    ) => boolean
  ) {}
  public includes(
    node: Readonly<AccessibilityNode>,
    context: Readonly<AccessibilityPolicyContext>
  ): boolean {
    return this.filter(node, context);
  }
}
export class CompositeAccessibilityPolicy implements AccessibilityPolicy {
  public readonly id = "accessibility-composite";
  public constructor(private readonly policies: readonly AccessibilityPolicy[]) {}
  public includes(
    node: Readonly<AccessibilityNode>,
    context: Readonly<AccessibilityPolicyContext>
  ): boolean {
    return this.policies.every((policy) => policy.includes(node, context));
  }
}
