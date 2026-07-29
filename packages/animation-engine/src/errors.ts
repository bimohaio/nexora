export interface Phase10ErrorContext {
  readonly code: string;
  readonly entityId?: string;
  readonly animationId?: string;
  readonly alarmId?: string;
  readonly cause?: unknown;
}

export class AnimationError extends Error {
  public readonly code: string;
  public readonly entityId: string | undefined;
  public readonly animationId: string | undefined;
  public override readonly cause?: unknown;

  public constructor(message: string, context: Phase10ErrorContext) {
    super(message);
    this.name = new.target.name;
    this.code = context.code;
    this.entityId = context.entityId;
    this.animationId = context.animationId;
    this.cause = context.cause;
  }
}

export class AnimationValidationError extends AnimationError {}
export class AnimationRegistrationError extends AnimationError {}
export class AnimationLifecycleError extends AnimationError {}
export class AnimationTargetError extends AnimationError {}
export class AnimationTimingError extends AnimationError {}
export class AnimationDisposedError extends AnimationError {}
export class ReducedMotionError extends AnimationError {}
export class VisibilityProviderError extends AnimationError {}
export class Phase10IntegrationError extends AnimationError {}
