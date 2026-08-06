import type { AnimationPriority } from "./contracts.js";
import type { PrimitiveAnimationInstance } from "./primitive-contracts.js";
import type {
  AnimationTaskMotionBehavior,
  AnimationInvalidation,
  AnimationScheduler,
  AnimationTaskHandle
} from "./scheduler-contracts.js";

export interface PrimitiveSchedulerBinding<T> {
  readonly instance: PrimitiveAnimationInstance<T>;
  readonly priority?: AnimationPriority;
  readonly motionBehavior?: AnimationTaskMotionBehavior;
  readonly invalidation?: Readonly<AnimationInvalidation>;
  readonly onResult?: (value: T | undefined) => void;
}

/**
 * Owns the single scheduler task attached to one primitive instance. The adapter does not own the
 * shared scheduler and disposing it never disposes that scheduler.
 */
export class PrimitiveSchedulerAdapter<T> {
  #handle: AnimationTaskHandle | undefined;
  #binding: PrimitiveSchedulerBinding<T> | undefined;

  public constructor(private readonly scheduler: AnimationScheduler) {}

  public attach(binding: PrimitiveSchedulerBinding<T>): AnimationTaskHandle {
    if (this.#handle !== undefined) return this.#handle;
    this.#binding = binding;
    binding.instance.schedule();
    binding.instance.play();
    this.#handle = this.scheduler.register({
      ...(binding.priority === undefined ? {} : { priority: binding.priority }),
      ...(binding.motionBehavior === undefined ? {} : { motionBehavior: binding.motionBehavior }),
      update: (frame) => {
        const result = binding.instance.update(frame.timestamp);
        try {
          binding.onResult?.(result.value);
        } catch {
          // Renderer/runtime sink failures are isolated from instance timing.
        }
        return {
          status: result.complete ? "complete" : "continue",
          ...(binding.invalidation === undefined
            ? {}
            : { invalidations: Object.freeze([binding.invalidation]) })
        };
      },
      onDispose: () => {
        binding.instance.dispose();
        this.#binding = undefined;
        this.#handle = undefined;
      }
    });
    return this.#handle;
  }

  public pause(): void {
    this.#binding?.instance.pause();
    this.#handle?.pause();
  }

  public resume(): void {
    this.#binding?.instance.resume();
    this.#handle?.resume();
  }

  public cancel(): void {
    this.#binding?.instance.cancel();
    this.#handle?.cancel();
    this.#binding = undefined;
    this.#handle = undefined;
  }

  public dispose(): void {
    this.#handle?.dispose();
    this.#binding?.instance.dispose();
    this.#binding = undefined;
    this.#handle = undefined;
  }
}
