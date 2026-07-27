import type { FocusPolicy, FocusPolicyContext, FocusTarget } from "../types/keyboard.js";

export class VisibilityFocusPolicy implements FocusPolicy {
  public readonly id = "focus-visible";
  public allows(target: Readonly<FocusTarget>): boolean {
    return target.hidden !== true;
  }
}
export class LockedFocusPolicy implements FocusPolicy {
  public readonly id = "focus-unlocked";
  public constructor(private readonly includeLocked = false) {}
  public allows(target: Readonly<FocusTarget>): boolean {
    return this.includeLocked || target.locked !== true;
  }
}
export class DisabledFocusPolicy implements FocusPolicy {
  public readonly id = "focus-enabled";
  public allows(target: Readonly<FocusTarget>): boolean {
    return target.disabled !== true;
  }
}
export class ReadOnlyFocusPolicy implements FocusPolicy {
  public readonly id = "focus-read-only";
  public allows(target: Readonly<FocusTarget>, context: Readonly<FocusPolicyContext>): boolean {
    return !context.readOnly || (target.kind !== "handle" && target.kind !== "port");
  }
}
export class CustomFocusPolicy implements FocusPolicy {
  public constructor(
    public readonly id: string,
    private readonly filter: (
      target: Readonly<FocusTarget>,
      context: Readonly<FocusPolicyContext>
    ) => boolean
  ) {}
  public allows(target: Readonly<FocusTarget>, context: Readonly<FocusPolicyContext>): boolean {
    return this.filter(target, context);
  }
}
export class CompositeFocusPolicy implements FocusPolicy {
  public readonly id = "focus-composite";
  public constructor(private readonly policies: readonly FocusPolicy[]) {}
  public allows(target: Readonly<FocusTarget>, context: Readonly<FocusPolicyContext>): boolean {
    return this.policies.every((policy) => policy.allows(target, context));
  }
}
