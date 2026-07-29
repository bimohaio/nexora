import {
  AnimationDisposedError,
  AnimationLifecycleError,
  AnimationValidationError
} from "./errors.js";
import type { InterpolationRegistry } from "./interpolation.js";
import type {
  AnimationContext,
  AnimationInstanceSnapshot,
  AnimationPrimitive,
  AnimationResult,
  PrimitiveAnimationInstance,
  PrimitiveConfiguration,
  PrimitiveInstanceId,
  PrimitivePlaybackState
} from "./primitive-contracts.js";
import type { AnimationPrimitiveRegistry } from "./primitive-registry.js";
import { AnimationTimeline } from "./timeline.js";

export interface PrimitiveLifecycleCallbacks<T> {
  readonly onStart?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
  readonly onPause?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
  readonly onResume?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
  readonly onComplete?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
  readonly onCancel?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
  readonly onDispose?: (snapshot: Readonly<AnimationInstanceSnapshot<T>>) => void;
}

export interface PrimitiveInstanceRequest<T> {
  readonly id: PrimitiveInstanceId;
  readonly primitiveId: AnimationPrimitive<T>["id"];
  readonly configuration: Readonly<PrimitiveConfiguration<T>>;
  readonly context: Readonly<AnimationContext>;
  readonly callbacks?: Readonly<PrimitiveLifecycleCallbacks<T>>;
}

const TERMINAL = new Set<PrimitivePlaybackState>(["completed", "cancelled", "disposed", "failed"]);

const freezeConfiguration = <T>(
  configuration: Readonly<PrimitiveConfiguration<T>>
): Readonly<PrimitiveConfiguration<T>> =>
  Object.freeze({
    ...configuration,
    timing: Object.freeze({
      ...configuration.timing,
      ...(configuration.timing.repeat === undefined
        ? {}
        : { repeat: Object.freeze({ ...configuration.timing.repeat }) })
    }),
    ...(configuration.parameters === undefined
      ? {}
      : { parameters: Object.freeze({ ...configuration.parameters }) })
  });

/**
 * One isolated primitive execution. Public configuration and snapshots are readonly; mutable
 * timing/playback state is private and transient.
 */
export class DefaultPrimitiveAnimationInstance<T> implements PrimitiveAnimationInstance<T> {
  public readonly id: PrimitiveInstanceId;
  public readonly primitiveId: AnimationPrimitive<T>["id"];
  readonly #configuration: Readonly<PrimitiveConfiguration<T>>;
  readonly #primitive: AnimationPrimitive<T>;
  readonly #context: Readonly<AnimationContext>;
  readonly #timeline: AnimationTimeline;
  #callbacks: Readonly<PrimitiveLifecycleCallbacks<T>> | undefined;
  #state: PrimitivePlaybackState = "created";
  #result: Readonly<AnimationResult<T>> | undefined;
  #completionNotified = false;

  public constructor(
    request: Readonly<PrimitiveInstanceRequest<T>>,
    primitive: AnimationPrimitive<T>
  ) {
    if (request.id.trim() === "")
      throw new AnimationValidationError("Instance ID is required.", {
        code: "INVALID_ANIMATION_CONFIGURATION"
      });
    this.id = request.id;
    this.primitiveId = request.primitiveId;
    this.#configuration = freezeConfiguration(request.configuration);
    this.#context = Object.freeze({ ...request.context });
    this.#callbacks = request.callbacks;
    this.#primitive = primitive;
    const diagnostics = primitive.validate(this.#configuration);
    const error = diagnostics.find((entry) => entry.severity === "error");
    if (error !== undefined)
      throw new AnimationValidationError(error.message, {
        code: error.code,
        animationId: request.id
      });
    this.#timeline = new AnimationTimeline(this.#configuration.timing);
  }

  public schedule(): void {
    this.#assertNotDisposed();
    if (this.#state === "scheduled") return;
    if (this.#state !== "created")
      throw this.#lifecycleError(`Cannot schedule from ${this.#state}.`);
    this.#state = "scheduled";
  }

  public play(): void {
    this.#assertNotDisposed();
    if (this.#state === "running") return;
    if (this.#state === "created") this.schedule();
    if (this.#state !== "scheduled") throw this.#lifecycleError(`Cannot play from ${this.#state}.`);
    this.#timeline.start(this.#context.clock.now());
    this.#state = "running";
    this.#notify("onStart");
  }

  public pause(): void {
    this.#assertNotDisposed();
    if (this.#state === "paused") return;
    if (this.#state !== "running") throw this.#lifecycleError(`Cannot pause from ${this.#state}.`);
    this.#timeline.pause(this.#context.clock.now());
    this.#state = "paused";
    this.#notify("onPause");
  }

  public resume(): void {
    this.#assertNotDisposed();
    if (this.#state === "running") return;
    if (this.#state !== "paused") throw this.#lifecycleError(`Cannot resume from ${this.#state}.`);
    this.#timeline.resume(this.#context.clock.now());
    this.#state = "running";
    this.#notify("onResume");
  }

  public stop(): void {
    this.cancel();
  }

  public cancel(): void {
    if (this.#state === "disposed" || this.#state === "cancelled") return;
    if (this.#state === "completed" || this.#state === "failed") return;
    this.#timeline.cancel();
    this.#state = "cancelled";
    this.#result = undefined;
    this.#notify("onCancel");
  }

  public restart(): void {
    this.reset();
    this.play();
  }

  public reset(): void {
    this.#assertNotDisposed();
    this.#timeline.reset();
    this.#state = "created";
    this.#result = undefined;
    this.#completionNotified = false;
  }

  public replay(): void {
    this.restart();
  }

  public seek(timeMs: number): Readonly<AnimationResult<T>> {
    this.#assertNotDisposed();
    return this.#evaluate(this.#timeline.seek(timeMs));
  }

  public seekRelative(deltaMs: number): Readonly<AnimationResult<T>> {
    this.#assertNotDisposed();
    return this.#evaluate(this.#timeline.seekRelative(deltaMs));
  }

  public seekProgress(progress: number): Readonly<AnimationResult<T>> {
    this.#assertNotDisposed();
    return this.#evaluate(this.#timeline.seekProgress(progress));
  }

  public reverse(): void {
    this.#assertNotDisposed();
    if (TERMINAL.has(this.#state))
      throw this.#lifecycleError(`Cannot reverse from ${this.#state}.`);
    this.#timeline.reverse();
  }

  public setPlaybackRate(rate: number): void {
    this.#assertNotDisposed();
    this.#timeline.setPlaybackRate(rate);
  }

  public update(currentTimeMs: number): Readonly<AnimationResult<T>> {
    this.#assertNotDisposed();
    if (this.#state === "created" || this.#state === "scheduled")
      throw this.#lifecycleError("Instance must be playing before update.");
    if (this.#state === "cancelled" || this.#state === "failed")
      throw this.#lifecycleError(`Cannot update from ${this.#state}.`);
    if (this.#state === "completed" || this.#state === "paused")
      return this.#result ?? this.#evaluate(this.#timeline.snapshot());
    try {
      const result = this.#evaluate(this.#timeline.update(currentTimeMs));
      if (result.complete) {
        this.#state = "completed";
        if (!this.#completionNotified) {
          this.#completionNotified = true;
          this.#notify("onComplete");
        }
      }
      return result;
    } catch (cause) {
      this.#state = "failed";
      this.#report("ANIMATION_PRIMITIVE_EVALUATION_FAILED", "Primitive evaluation failed.", cause);
      throw cause;
    }
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    this.#timeline.dispose();
    this.#state = "disposed";
    this.#result = undefined;
    this.#notify("onDispose");
    this.#callbacks = undefined;
  }

  public snapshot(): Readonly<AnimationInstanceSnapshot<T>> {
    const timeline =
      this.#state === "disposed" || this.#state === "cancelled"
        ? undefined
        : this.#timeline.snapshot();
    return Object.freeze({
      id: this.id,
      primitiveId: this.primitiveId,
      state: this.#state,
      elapsedTimeMs: timeline?.elapsedTimeMs ?? 0,
      progress: timeline?.directedProgress ?? 0,
      iteration: timeline?.iteration ?? 0,
      reversed: this.#timeline.reversed,
      result: this.#result
    });
  }

  #evaluate(timeline: ReturnType<AnimationTimeline["snapshot"]>): Readonly<AnimationResult<T>> {
    const interpolationProgress = timeline.directedProgress;
    const value = timeline.valueOwned
      ? this.#primitive.evaluate({
          instanceId: this.id,
          configuration: this.#configuration,
          elapsedTimeMs: timeline.elapsedTimeMs,
          progress: timeline.progress,
          directedProgress: interpolationProgress,
          iteration: timeline.iteration
        })
      : undefined;
    this.#result = Object.freeze({
      value,
      progress: timeline.progress,
      directedProgress: interpolationProgress,
      iteration: timeline.iteration,
      active: timeline.active,
      complete: timeline.complete
    });
    return this.#result;
  }

  #notify(callback: keyof PrimitiveLifecycleCallbacks<T>): void {
    try {
      this.#callbacks?.[callback]?.(this.snapshot());
    } catch (cause) {
      this.#report("ANIMATION_CALLBACK_FAILED", `Lifecycle callback '${callback}' failed.`, cause);
    }
  }

  #report(code: string, message: string, cause?: unknown): void {
    this.#context.reportDiagnostic?.(
      Object.freeze({
        code,
        severity: "error",
        message,
        instanceId: this.id,
        primitiveId: this.primitiveId,
        recoverable: true,
        context: Object.freeze({ state: this.#state }),
        cause
      })
    );
  }

  #assertNotDisposed(): void {
    if (this.#state === "disposed")
      throw new AnimationDisposedError("Animation instance is disposed.", {
        code: "ANIMATION_INSTANCE_DISPOSED",
        animationId: this.id
      });
  }

  #lifecycleError(message: string): AnimationLifecycleError {
    return new AnimationLifecycleError(message, {
      code: "INVALID_LIFECYCLE_STATE",
      animationId: this.id
    });
  }
}

export class AnimationPrimitiveFactory {
  public constructor(
    private readonly registry: AnimationPrimitiveRegistry,
    private readonly interpolations: InterpolationRegistry
  ) {}

  public create<T>(
    request: Readonly<PrimitiveInstanceRequest<T>>
  ): DefaultPrimitiveAnimationInstance<T> {
    const registration = this.registry.resolve<T>(request.primitiveId);
    if (
      !registration.metadata.supportedInterpolations.includes(
        request.configuration.interpolation ?? "linear"
      )
    )
      throw new AnimationValidationError(
        "Primitive does not support the requested interpolation.",
        {
          code: "UNSUPPORTED_INTERPOLATION",
          animationId: request.id
        }
      );
    this.interpolations.resolve(request.configuration.interpolation ?? "linear");
    const primitive = registration.factory();
    if (primitive.id !== registration.metadata.id)
      throw new AnimationValidationError("Primitive factory returned an incompatible identifier.", {
        code: "FACTORY_CONSTRUCTION_FAILED",
        animationId: request.id
      });
    return new DefaultPrimitiveAnimationInstance(request, primitive);
  }
}
