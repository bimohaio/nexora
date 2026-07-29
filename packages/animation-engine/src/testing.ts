import type {
  AnimationDefinition,
  AnimationDefinitionId,
  AnimationFrameCallback,
  AnimationFrameRequestId,
  AnimationTypeId,
  EntityVisibilityProvider,
  MotionPreference,
  MotionPreferenceSource,
  VisibilityState
} from "./contracts.js";
import { ManualAnimationClock } from "./clock.js";

export { DiagnosticCollector } from "./diagnostics.js";
export { ManualAnimationFrameDriver } from "./frame-drivers.js";
export { ManualAnimationClock, ManualAnimationClock as TestAnimationClock } from "./clock.js";

export class ManualFrameScheduler {
  readonly #clock: ManualAnimationClock;
  readonly #callbacks = new Map<AnimationFrameRequestId, AnimationFrameCallback>();
  #nextId = 1;

  public constructor(clock = new ManualAnimationClock()) {
    this.#clock = clock;
  }

  public request(callback: AnimationFrameCallback): AnimationFrameRequestId {
    const id = this.#nextId++ as AnimationFrameRequestId;
    this.#callbacks.set(id, callback);
    return id;
  }

  public cancel(id: AnimationFrameRequestId): void {
    this.#callbacks.delete(id);
  }

  public flushFrame(deltaMs = 16): number {
    const timestamp = this.#clock.advanceBy(deltaMs);
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    for (const callback of callbacks) callback(timestamp);
    return callbacks.length;
  }

  public get pendingCount(): number {
    return this.#callbacks.size;
  }
}

export class TestMotionPreferenceSource implements MotionPreferenceSource {
  #current: MotionPreference;
  readonly #listeners = new Set<(value: MotionPreference) => void>();

  public constructor(initial: MotionPreference = "no-preference") {
    this.#current = initial;
  }
  public getCurrent(): MotionPreference {
    return this.#current;
  }
  public subscribe(listener: (preference: MotionPreference) => void): () => void {
    this.#listeners.add(listener);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.#listeners.delete(listener);
    };
  }
  public set(preference: MotionPreference): void {
    if (preference === this.#current) return;
    this.#current = preference;
    for (const listener of [...this.#listeners]) listener(preference);
  }
}

export class TestVisibilityProvider implements EntityVisibilityProvider {
  readonly #states = new Map<string, VisibilityState>();
  readonly #listeners = new Map<string, Set<(value: VisibilityState) => void>>();
  public getState(entityId: string): VisibilityState {
    return this.#states.get(entityId) ?? "visible";
  }
  public subscribe(entityId: string, listener: (state: VisibilityState) => void): () => void {
    const listeners = this.#listeners.get(entityId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(entityId, listeners);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(entityId);
    };
  }
  public set(entityId: string, state: VisibilityState): void {
    this.#states.set(entityId, state);
    for (const listener of [...(this.#listeners.get(entityId) ?? [])]) listener(state);
  }
}

export function createTestAnimationDefinition(
  overrides: Partial<AnimationDefinition> = {}
): AnimationDefinition {
  return {
    id: "test-animation" as AnimationDefinitionId,
    type: "rotate" as AnimationTypeId,
    target: { entityId: "test-entity", kind: "node", property: "rotation" },
    timing: { durationMs: 1000 },
    ...overrides
  };
}
