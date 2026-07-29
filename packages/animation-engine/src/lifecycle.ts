import type { AnimationHandle, AnimationInstanceId, AnimationLifecycleState } from "./contracts.js";
import { AnimationLifecycleError } from "./errors.js";

const TRANSITIONS: Readonly<Record<AnimationLifecycleState, readonly AnimationLifecycleState[]>> = {
  idle: ["scheduled", "cancelled", "failed", "disposed"],
  scheduled: ["delayed", "running", "cancelled", "failed", "disposed"],
  delayed: ["running", "cancelled", "failed", "disposed"],
  running: ["paused", "completed", "cancelled", "failed", "disposed"],
  paused: ["running", "cancelled", "failed", "disposed"],
  completed: ["disposed"],
  cancelled: ["disposed"],
  disposed: [],
  failed: ["disposed"]
};

export function canTransitionAnimation(
  from: AnimationLifecycleState,
  to: AnimationLifecycleState
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export class AnimationLifecycle implements AnimationHandle {
  #state: AnimationLifecycleState;

  public constructor(
    public readonly id: AnimationInstanceId,
    initialState: AnimationLifecycleState = "idle"
  ) {
    this.#state = initialState;
  }

  public getState(): AnimationLifecycleState {
    return this.#state;
  }

  public transition(next: AnimationLifecycleState): void {
    if (this.#state === next) return;
    if (!canTransitionAnimation(this.#state, next))
      throw new AnimationLifecycleError(
        `Animation lifecycle cannot transition from ${this.#state} to ${next}.`,
        {
          code: "ANIMATION_INVALID_LIFECYCLE_TRANSITION",
          animationId: this.id
        }
      );
    this.#state = next;
  }

  public pause(): void {
    if (this.#state === "paused" || this.#state === "disposed") return;
    this.transition("paused");
  }

  public resume(): void {
    if (this.#state === "running" || this.#state === "disposed") return;
    this.transition("running");
  }

  public cancel(): void {
    if (["cancelled", "completed", "failed", "disposed"].includes(this.#state)) return;
    this.transition("cancelled");
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    this.transition("disposed");
  }
}

export class AnimationOwnershipRegistry {
  readonly #byOwner = new Map<string, Map<AnimationInstanceId, AnimationHandle>>();
  readonly #byId = new Map<AnimationInstanceId, AnimationHandle>();
  #disposed = false;

  public register(ownerId: string, handle: AnimationHandle): void {
    if (this.#disposed)
      throw new AnimationLifecycleError("Animation owner registry is disposed.", {
        code: "ANIMATION_OWNER_DISPOSED",
        animationId: handle.id
      });
    if (ownerId.trim() === "" || this.#byId.has(handle.id))
      throw new AnimationLifecycleError("Animation registration owner or ID is invalid.", {
        code: "ANIMATION_DUPLICATE_INSTANCE",
        animationId: handle.id
      });
    const owned = this.#byOwner.get(ownerId) ?? new Map<AnimationInstanceId, AnimationHandle>();
    owned.set(handle.id, handle);
    this.#byOwner.set(ownerId, owned);
    this.#byId.set(handle.id, handle);
  }

  public get(id: AnimationInstanceId): AnimationHandle | undefined {
    return this.#byId.get(id);
  }

  public disposeOwner(ownerId: string): void {
    const owned = this.#byOwner.get(ownerId);
    if (owned === undefined) return;
    for (const [id, handle] of owned) {
      handle.dispose();
      this.#byId.delete(id);
    }
    this.#byOwner.delete(ownerId);
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const ownerId of [...this.#byOwner.keys()]) this.disposeOwner(ownerId);
    this.#disposed = true;
  }
}
