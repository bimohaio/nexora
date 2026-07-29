import type { AnimationClock, AnimationDirection, AnimationFillMode } from "./contracts.js";

export type PrimitiveId = string & { readonly __brand: "PrimitiveId" };
export type PrimitiveInstanceId = string & { readonly __brand: "PrimitiveInstanceId" };

export type PrimitivePlaybackState =
  | "created"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "disposed"
  | "failed";

export type PrimitiveRepeatMode =
  | { readonly kind: "once" }
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "infinite" }
  | { readonly kind: "until-cancelled" };

export type PrimitiveInterpolationId =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step"
  | "discrete"
  | (string & {});

export interface PrimitiveTiming {
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly endDelayMs?: number;
  readonly playbackRate?: number;
  readonly direction?: AnimationDirection;
  readonly fillMode?: AnimationFillMode;
  readonly repeat?: PrimitiveRepeatMode;
}

export interface AnimationContext {
  /** Shared scheduler-owned clock. Instances never create or query a wall clock. */
  readonly clock: AnimationClock;
  readonly globalPlaybackRate?: number;
  readonly reducedMotion?: boolean;
  readonly reportDiagnostic?: (diagnostic: Readonly<PrimitiveDiagnostic>) => void;
}

export interface PrimitiveDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly instanceId?: PrimitiveInstanceId;
  readonly primitiveId?: PrimitiveId;
  readonly recoverable: boolean;
  readonly context: Readonly<Record<string, string | number | boolean>>;
  readonly cause?: unknown;
}

export interface PrimitiveConfiguration<T> {
  readonly timing: PrimitiveTiming;
  readonly from: T;
  readonly to: T;
  readonly interpolation?: PrimitiveInterpolationId;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface PrimitiveEvaluationContext<T> {
  readonly instanceId: PrimitiveInstanceId;
  readonly configuration: Readonly<PrimitiveConfiguration<T>>;
  readonly elapsedTimeMs: number;
  readonly progress: number;
  readonly directedProgress: number;
  readonly iteration: number;
}

export interface AnimationResult<T> {
  readonly value: T | undefined;
  readonly progress: number;
  readonly directedProgress: number;
  readonly iteration: number;
  readonly active: boolean;
  readonly complete: boolean;
}

export interface AnimationPrimitive<T> {
  readonly id: PrimitiveId;
  evaluate(context: Readonly<PrimitiveEvaluationContext<T>>): T;
  validate(configuration: Readonly<PrimitiveConfiguration<T>>): readonly PrimitiveDiagnostic[];
}

export interface PrimitiveMetadata {
  readonly id: PrimitiveId;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly engineCompatibility: string;
  readonly aliases?: readonly PrimitiveId[];
  readonly deprecated?: boolean;
  readonly replacement?: PrimitiveId;
  readonly supportedDirections: readonly AnimationDirection[];
  readonly supportedFillModes: readonly AnimationFillMode[];
  readonly supportedInterpolations: readonly PrimitiveInterpolationId[];
}

export interface PrimitiveRegistration<T = unknown> {
  readonly metadata: PrimitiveMetadata;
  readonly factory: () => AnimationPrimitive<T>;
}

export interface AnimationInstanceSnapshot<T> {
  readonly id: PrimitiveInstanceId;
  readonly primitiveId: PrimitiveId;
  readonly state: PrimitivePlaybackState;
  readonly elapsedTimeMs: number;
  readonly progress: number;
  readonly iteration: number;
  readonly reversed: boolean;
  readonly result: Readonly<AnimationResult<T>> | undefined;
}

export interface PrimitiveAnimationInstance<T> {
  readonly id: PrimitiveInstanceId;
  readonly primitiveId: PrimitiveId;
  play(): void;
  schedule(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  cancel(): void;
  reset(): void;
  restart(): void;
  replay(): void;
  seek(timeMs: number): Readonly<AnimationResult<T>>;
  seekRelative(deltaMs: number): Readonly<AnimationResult<T>>;
  seekProgress(progress: number): Readonly<AnimationResult<T>>;
  reverse(): void;
  setPlaybackRate(rate: number): void;
  update(currentTimeMs: number): Readonly<AnimationResult<T>>;
  dispose(): void;
  snapshot(): Readonly<AnimationInstanceSnapshot<T>>;
}
