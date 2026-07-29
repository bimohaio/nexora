export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type AnimationTypeId = Brand<string, "AnimationTypeId">;
export type AnimationDefinitionId = Brand<string, "AnimationDefinitionId">;
export type AnimationInstanceId = Brand<string, "AnimationInstanceId">;
export type AnimationFrameRequestId = Brand<number, "AnimationFrameRequestId">;

export const BUILTIN_ANIMATION_TYPES = {
  blink: "blink",
  flash: "flash",
  rotate: "rotate",
  translate: "translate",
  scale: "scale",
  opacity: "opacity",
  flow: "flow",
  transition: "transition"
} as const;
export type AnimationType = (typeof BUILTIN_ANIMATION_TYPES)[keyof typeof BUILTIN_ANIMATION_TYPES];

export type AnimationTargetKind = "node" | "connection" | "overlay";
export interface AnimationTarget {
  readonly entityId: string;
  readonly kind: AnimationTargetKind;
  readonly property: string;
  readonly part?: string;
}

export type AnimationCondition =
  | { readonly kind: "boolean"; readonly expected: boolean }
  | { readonly kind: "state"; readonly expected: string }
  | { readonly kind: "binding-result"; readonly expected: unknown };

export type AnimationTrigger =
  | {
      readonly kind: "runtime-boolean";
      readonly bindingId: string;
      readonly expected: boolean;
    }
  | {
      readonly kind: "runtime-state";
      readonly bindingId: string;
      readonly expected: string;
    }
  | {
      readonly kind: "binding-result";
      readonly bindingId: string;
      readonly condition: AnimationCondition;
    }
  | { readonly kind: "alarm"; readonly alarmId: string; readonly active?: boolean }
  | { readonly kind: "manual"; readonly triggerId: string };

export type AnimationDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export type AnimationFillMode = "none" | "forwards" | "backwards" | "both";
export type AnimationRepeatMode = "once" | "count" | "infinite";
export type AnimationPriority =
  | "decorative"
  | "designer-preview"
  | "runtime"
  | "alarm"
  | "critical-alarm"
  | "accessibility";
export type BuiltinAnimationEasing =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step-start"
  | "step-end";
export interface CubicBezierEasing {
  readonly kind: "cubic-bezier";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
export type AnimationEasing = BuiltinAnimationEasing | CubicBezierEasing;

export interface AnimationTiming {
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly iterations?: number | "infinite";
  readonly direction?: AnimationDirection;
  readonly fillMode?: AnimationFillMode;
  readonly easing?: AnimationEasing;
  readonly playbackRate?: number;
}

export type MotionPreference = "no-preference" | "reduce";
export type ReducedMotionPolicy =
  | { readonly mode: "disable" }
  | { readonly mode: "freeze-at-start" }
  | { readonly mode: "freeze-at-end" }
  | { readonly mode: "replace-with-static-state" }
  | { readonly mode: "reduce-rate"; readonly factor: number };
export type VisibilityState =
  | "visible"
  | "partially-visible"
  | "offscreen"
  | "document-hidden"
  | "unmounted";
export type VisibilityPolicy =
  | "always-run"
  | "pause-offscreen"
  | "throttle-offscreen"
  | "pause-when-document-hidden";

export interface AnimationDefinition {
  readonly id: AnimationDefinitionId;
  readonly type: AnimationTypeId;
  readonly target: AnimationTarget;
  readonly trigger?: AnimationTrigger;
  readonly timing: AnimationTiming;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly reducedMotion?: ReducedMotionPolicy;
  readonly visibility?: VisibilityPolicy;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export type AnimationLifecycleState =
  | "idle"
  | "scheduled"
  | "delayed"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "disposed"
  | "failed";
export interface AnimationHandle {
  readonly id: AnimationInstanceId;
  getState(): AnimationLifecycleState;
  pause(): void;
  resume(): void;
  cancel(): void;
  dispose(): void;
}
export interface AnimationRegistration {
  readonly instanceId: AnimationInstanceId;
  readonly definition: AnimationDefinition;
  readonly ownerId: string;
  readonly rendererInstanceId?: string;
  readonly registrationOrder?: number;
}

export interface AnimationClock {
  now(): number;
}
export type AnimationFrameCallback = (timestampMs: number) => void;
export interface AnimationFrameScheduler {
  request(callback: AnimationFrameCallback): AnimationFrameRequestId;
  cancel(id: AnimationFrameRequestId): void;
}
export interface AnimationFrame {
  readonly timestampMs: number;
  readonly deltaMs: number;
  readonly frameNumber: number;
}
export interface AnimationSample {
  readonly instanceId: AnimationInstanceId;
  readonly progress: number;
  readonly iteration: number;
  readonly direction: "forward" | "reverse";
  readonly elapsedMs: number;
  readonly localTimeMs: number;
}
export type AnimationCompositionMode = "replace" | "add" | "multiply" | "compose";
export interface AnimationContribution {
  readonly instanceId: AnimationInstanceId;
  readonly entityId: string;
  readonly target: AnimationTarget;
  readonly priority: number;
  readonly registrationOrder: number;
  readonly composition?: AnimationCompositionMode;
  readonly value: number | string | boolean | Readonly<Record<string, unknown>>;
}
export interface AnimationVisualState {
  readonly opacity?: number;
  readonly rotationDeg?: number;
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly fill?: string;
  readonly stroke?: string;
  readonly flowOffset?: number;
  readonly visible?: boolean;
  readonly custom?: Readonly<Record<string, unknown>>;
}
export type VisualStatePriority =
  | "design"
  | "runtime"
  | "binding"
  | "animation"
  | "alarm"
  | "interaction"
  | "accessibility";

export interface MotionPreferenceSource {
  getCurrent(): MotionPreference;
  subscribe(listener: (preference: MotionPreference) => void): () => void;
}
export interface EntityVisibilityProvider {
  getState(entityId: string): VisibilityState;
  subscribe(entityId: string, listener: (state: VisibilityState) => void): () => void;
}
export interface Disposable {
  dispose(): void;
}

export type Phase10DiagnosticSeverity = "info" | "warning" | "error";
export interface Phase10Diagnostic {
  readonly code: string;
  readonly severity: Phase10DiagnosticSeverity;
  readonly message: string;
  readonly entityId?: string;
  readonly animationId?: string;
  readonly alarmId?: string;
  readonly timestamp: number;
}
export type AnimationDiagnostic = Phase10Diagnostic;
export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "warning" | "error";
}
export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly issues: readonly ValidationIssue[];
}

export interface AnimationTypeDefinition {
  readonly id: AnimationTypeId;
  readonly displayName: string;
  readonly supportedTargets: readonly string[];
  readonly validateParameters?: (
    parameters: Readonly<Record<string, unknown>>
  ) => readonly ValidationIssue[];
}
export interface AnimationTypeRegistry {
  register(definition: AnimationTypeDefinition): void;
  get(id: AnimationTypeId): AnimationTypeDefinition | undefined;
  has(id: AnimationTypeId): boolean;
  list(): readonly AnimationTypeDefinition[];
}

export interface RuntimeAnimationTriggerEvent {
  readonly entityId: string;
  readonly bindingId?: string;
  readonly active: boolean;
  readonly timestamp: number;
  readonly revision: number;
}
export interface Phase10BindingOutput {
  readonly entityId: string;
  readonly target: string;
  readonly value: unknown;
  readonly quality: string;
  readonly timestamp: number;
  readonly revision: number;
}
export interface SymbolPhase10Capabilities {
  readonly animationTargets?: readonly string[];
  readonly alarmVisualTargets?: readonly string[];
  readonly parts?: readonly string[];
}
export interface Phase10RendererUpdate<TAlarm = unknown> {
  readonly entityId: string;
  readonly revision: number;
  readonly animation?: AnimationVisualState;
  readonly alarm?: TAlarm;
}
export interface AnimationAuthoringMetadata {
  readonly type: AnimationTypeId;
  readonly displayName: string;
  readonly parameterFields: readonly {
    readonly key: string;
    readonly label: string;
    readonly valueType: "number" | "string" | "boolean" | "select";
    readonly required?: boolean;
  }[];
}
