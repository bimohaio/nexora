import type { InteractionTarget } from "../../types/index.js";
import type { SelectionState } from "../state/index.js";
import type { SelectionTargetFilter } from "../types/index.js";

export interface SelectionPolicyContext {
  readonly state: SelectionState;
  readonly readOnly: boolean;
}

export interface SelectionPolicy {
  allows(target: Readonly<InteractionTarget>, context: Readonly<SelectionPolicyContext>): boolean;
}

export class MetadataSelectionPolicy implements SelectionPolicy {
  public allows(target: Readonly<InteractionTarget>): boolean {
    const metadata = target.metadata;
    return (
      metadata?.locked !== true &&
      metadata?.hidden !== true &&
      metadata?.visible !== false &&
      metadata?.disabled !== true &&
      metadata?.layerLocked !== true &&
      metadata?.layerVisible !== false
    );
  }
}

export class ReadOnlySelectionPolicy implements SelectionPolicy {
  public allows(
    _target: Readonly<InteractionTarget>,
    context: Readonly<SelectionPolicyContext>
  ): boolean {
    return !context.readOnly;
  }
}

export class FilterSelectionPolicy implements SelectionPolicy {
  public constructor(private readonly filter: SelectionTargetFilter) {}
  public allows(target: Readonly<InteractionTarget>): boolean {
    const layerId = target.metadata?.layerId;
    if (typeof layerId === "string" && this.filter.allowLayer?.(layerId) === false) return false;
    if (target.kind === "node") return this.filter.allowNode?.(target) ?? true;
    if (target.kind === "connection") return this.filter.allowConnection?.(target) ?? true;
    if (target.kind === "custom") return this.filter.allowCustom?.(target) ?? true;
    return true;
  }
}

export class CompositeSelectionPolicy implements SelectionPolicy {
  public constructor(private readonly policies: readonly SelectionPolicy[]) {}
  public allows(
    target: Readonly<InteractionTarget>,
    context: Readonly<SelectionPolicyContext>
  ): boolean {
    return this.policies.every((policy) => policy.allows(target, context));
  }
}
