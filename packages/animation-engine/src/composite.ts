import {
  AnimationDisposedError,
  AnimationLifecycleError,
  AnimationValidationError
} from "./errors.js";
import { clampProgress } from "./interpolation.js";

export type CompositeType =
  | "parallel"
  | "sequence"
  | "stagger"
  | "delay-group"
  | "race"
  | "barrier"
  | "conditional";
export type CompositeState =
  | "created"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "disposed"
  | "failed";
export type CompositeDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export type CompositeRepeat =
  | { readonly kind: "once" }
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "infinite" };
export type CompositeFailurePolicy =
  | { readonly kind: "ignore" }
  | { readonly kind: "continue" }
  | { readonly kind: "stop" }
  | {
      readonly kind: "retry";
      readonly maxAttempts: number;
      readonly delayMs?: number;
      readonly backoffFactor?: number;
      readonly fallback?: CompositeChildInstance;
    };

export interface CompositeConditionContext {
  readonly compositeId: string;
  readonly iteration: number;
}

export interface CompositeChild {
  readonly id: string;
  readonly instance: CompositeChildInstance;
  readonly offsetMs?: number;
  readonly required?: boolean;
  readonly condition?: (context: Readonly<CompositeConditionContext>) => boolean;
}

export interface CompositeChildInstance {
  play(currentTimeMs?: number): void;
  pause(currentTimeMs?: number): void;
  resume(currentTimeMs?: number): void;
  cancel(): void;
  reset?(): void;
  restart(): void;
  dispose(): void;
  reverse?(): void;
  seekProgress?(progress: number): unknown;
  setPlaybackRate?(rate: number): void;
  update(currentTimeMs: number): Readonly<{ readonly complete: boolean }>;
  snapshot(): Readonly<{ readonly progress: number; readonly state?: string }>;
  compositeChildren?(): readonly CompositeChildInstance[];
}

export interface CompositeConfiguration {
  readonly id: string;
  readonly type: CompositeType;
  readonly children: readonly CompositeChild[];
  readonly delayMs?: number;
  readonly staggerMs?: number;
  readonly repeat?: CompositeRepeat;
  readonly direction?: CompositeDirection;
  readonly failurePolicy?: CompositeFailurePolicy;
}

export interface CompositeSnapshot {
  readonly id: string;
  readonly type: CompositeType;
  readonly state: CompositeState;
  readonly complete: boolean;
  readonly progress: number;
  readonly iteration: number;
  readonly reversed: boolean;
  readonly playbackRate: number;
  readonly activeChildIds: readonly string[];
  readonly completedChildIds: readonly string[];
  readonly remainingChildIds: readonly string[];
  readonly failureCount: number;
  readonly retryCount: number;
}

export interface CompositeGraphNode {
  readonly id: string;
  readonly children: readonly CompositeGraphNode[];
}

interface ChildState {
  readonly id: string;
  readonly instance: CompositeChildInstance;
  readonly offsetMs: number;
  readonly required: boolean;
  readonly condition: ((context: Readonly<CompositeConditionContext>) => boolean) | undefined;
  started: boolean;
  completed: boolean;
  skipped: boolean;
  failed: boolean;
  retryAttempts: number;
  retryAtMs: number | undefined;
}

/** Rejects self references and indirect cycles using object identity, independent of node IDs. */
export function validateCompositeGraph(root: CompositeGraphNode): void {
  const visiting = new Set<CompositeGraphNode>();
  const visited = new Set<CompositeGraphNode>();
  const stack: { readonly node: CompositeGraphNode; index: number }[] = [{ node: root, index: 0 }];
  visiting.add(root);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) break;
    if (frame.index >= frame.node.children.length) {
      visiting.delete(frame.node);
      visited.add(frame.node);
      stack.pop();
      continue;
    }
    const child = frame.node.children[frame.index];
    frame.index += 1;
    if (child === undefined || visited.has(child)) continue;
    if (visiting.has(child))
      throw new AnimationValidationError(`Composite graph contains a cycle at '${child.id}'.`, {
        code: "ANIMATION_COMPOSITE_CYCLE"
      });
    visiting.add(child);
    stack.push({ node: child, index: 0 });
  }
}

/**
 * Scheduler-neutral coordinator for primitive or nested composite instances. Retry waits, loops,
 * conditions, and propagation advance only when the owner supplies shared scheduler time.
 */
export class AnimationComposite implements CompositeChildInstance {
  readonly #id: string;
  readonly #type: CompositeType;
  readonly #children: ChildState[];
  readonly #delayMs: number;
  readonly #repeat: CompositeRepeat;
  readonly #direction: CompositeDirection;
  readonly #failurePolicy: CompositeFailurePolicy;
  #state: CompositeState = "created";
  #startTimeMs: number | undefined;
  #lastTimeMs: number | undefined;
  #resumePending = false;
  #iteration = 0;
  #failureCount = 0;
  #retryCount = 0;
  #manuallyReversed = false;
  #playbackRate = 1;
  #fallback: CompositeChildInstance | undefined;
  #fallbackActive = false;

  public constructor(configuration: Readonly<CompositeConfiguration>) {
    this.#id = configuration.id;
    if (configuration.id.trim() === "" || configuration.children.length === 0)
      throw this.#configurationError("Composite ID and children are required.");
    this.#type = configuration.type;
    this.#delayMs = configuration.delayMs ?? 0;
    this.#repeat = Object.freeze({ ...(configuration.repeat ?? { kind: "once" }) });
    this.#direction = configuration.direction ?? "normal";
    this.#failurePolicy = Object.freeze({
      ...(configuration.failurePolicy ?? { kind: "continue" })
    });
    this.#validateConfiguration(configuration);
    const ids = new Set<string>();
    const stagger = configuration.staggerMs ?? 0;
    this.#children = configuration.children.map((child, index) => {
      if (child.id.trim() === "" || ids.has(child.id))
        throw this.#configurationError("Composite child IDs must be unique.");
      ids.add(child.id);
      const offset =
        this.#type === "stagger"
          ? (child.offsetMs ?? index * stagger)
          : this.#type === "delay-group"
            ? this.#delayMs + (child.offsetMs ?? 0)
            : (child.offsetMs ?? 0);
      if (!Number.isFinite(offset) || offset < 0)
        throw this.#configurationError("Composite child offset must be non-negative.");
      return {
        id: child.id,
        instance: child.instance,
        offsetMs: offset,
        required: child.required ?? true,
        condition: child.condition,
        started: false,
        completed: false,
        skipped: false,
        failed: false,
        retryAttempts: 0,
        retryAtMs: undefined
      };
    });
    this.#assertNestedAcyclic();
  }

  public play(currentTimeMs = 0): void {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state === "running") return;
    if (this.#state !== "created")
      throw this.#lifecycleError(`Cannot play composite from ${this.#state}.`);
    this.#startTimeMs = currentTimeMs;
    this.#lastTimeMs = currentTimeMs;
    this.#state = "running";
    this.#applyIterationDirection();
    this.#startEligible(0, currentTimeMs);
  }

  public update(currentTimeMs: number): CompositeSnapshot {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state === "paused" || this.#state === "completed") return this.snapshot();
    if (this.#state !== "running" || this.#startTimeMs === undefined)
      throw this.#lifecycleError("Composite must be running before update.");
    if (this.#resumePending && this.#lastTimeMs !== undefined) {
      const pausedDuration = Math.max(0, currentTimeMs - this.#lastTimeMs);
      this.#startTimeMs += pausedDuration;
      for (const child of this.#children)
        if (child.retryAtMs !== undefined) child.retryAtMs += pausedDuration;
      this.#resumePending = false;
    }
    this.#lastTimeMs = currentTimeMs;
    if (this.#fallbackActive) return this.#updateFallback(currentTimeMs);
    const elapsed = Math.max(0, (currentTimeMs - this.#startTimeMs) * this.#playbackRate);
    this.#processRetries(currentTimeMs);
    this.#startEligible(elapsed, currentTimeMs);
    const ordered = this.#executionOrder();
    for (const child of ordered) {
      if (!child.started || child.completed || child.failed || child.retryAtMs !== undefined)
        continue;
      try {
        const result = child.instance.update(currentTimeMs);
        if (result.complete) {
          child.completed = true;
          if (this.#type === "sequence") this.#startEligible(elapsed, currentTimeMs);
          if (this.#type === "race") {
            for (const sibling of this.#children)
              if (sibling !== child && !sibling.completed) sibling.instance.cancel();
            return this.#completeOrRepeat(currentTimeMs);
          }
        }
      } catch {
        this.#handleFailure(child, currentTimeMs);
        if (
          this.#failurePolicy.kind === "stop" ||
          (this.#failurePolicy.kind === "retry" &&
            this.#failurePolicy.fallback !== undefined &&
            child.retryAttempts >= this.#failurePolicy.maxAttempts)
        )
          return this.snapshot();
      }
    }
    const completionSet =
      this.#type === "barrier" ? this.#children.filter((child) => child.required) : this.#children;
    if (
      completionSet.every(
        (child) =>
          child.completed ||
          child.skipped ||
          (child.failed && child.retryAtMs === undefined && !this.#fallbackActive)
      )
    )
      return this.#completeOrRepeat(currentTimeMs);
    return this.snapshot();
  }

  public pause(currentTimeMs = this.#lastTimeMs ?? 0): void {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state === "paused") return;
    if (this.#state !== "running")
      throw this.#lifecycleError(`Cannot pause composite from ${this.#state}.`);
    for (const child of this.#children)
      if (child.started && !child.completed && !child.failed) child.instance.pause();
    if (this.#fallbackActive) this.#fallback?.pause();
    this.#lastTimeMs = currentTimeMs;
    this.#state = "paused";
  }

  public resume(currentTimeMs?: number): void {
    this.#assertUsable();
    const resolvedTime = currentTimeMs ?? this.#lastTimeMs ?? 0;
    this.#validateTime(resolvedTime);
    if (this.#state === "running") return;
    if (this.#state !== "paused")
      throw this.#lifecycleError(`Cannot resume composite from ${this.#state}.`);
    for (const child of this.#children)
      if (child.started && !child.completed && !child.failed) child.instance.resume();
    if (this.#fallbackActive) this.#fallback?.resume();
    if (currentTimeMs !== undefined && this.#lastTimeMs !== undefined) {
      const pausedDuration = Math.max(0, currentTimeMs - this.#lastTimeMs);
      if (this.#startTimeMs !== undefined) this.#startTimeMs += pausedDuration;
      for (const child of this.#children)
        if (child.retryAtMs !== undefined) child.retryAtMs += pausedDuration;
      this.#lastTimeMs = currentTimeMs;
      this.#resumePending = false;
    } else this.#resumePending = true;
    this.#state = "running";
  }

  public cancel(): void {
    if (this.#state === "disposed" || this.#state === "cancelled") return;
    for (const child of this.#children) if (!child.completed) child.instance.cancel();
    this.#fallback?.cancel();
    this.#state = "cancelled";
  }

  public reset(): void {
    this.#assertUsable();
    for (const child of this.#children) this.#resetChild(child);
    this.#fallback?.reset?.();
    this.#state = "created";
    this.#startTimeMs = undefined;
    this.#lastTimeMs = undefined;
    this.#resumePending = false;
    this.#iteration = 0;
    this.#failureCount = 0;
    this.#retryCount = 0;
    this.#fallbackActive = false;
    this.#manuallyReversed = false;
  }

  public restart(currentTimeMs = 0): void {
    this.reset();
    this.play(currentTimeMs);
  }

  public seekProgress(progress: number): CompositeSnapshot {
    this.#assertUsable();
    const normalized = clampProgress(progress);
    const ordered = this.#executionOrder();
    if (this.#type === "sequence") {
      const scaled = normalized * ordered.length;
      for (let index = 0; index < ordered.length; index += 1) {
        const child = ordered[index];
        if (child === undefined) continue;
        const local = clampProgress(scaled - index);
        const shouldStart = local > 0 || index === 0;
        if (shouldStart && !child.started) child.instance.play(this.#lastTimeMs ?? 0);
        child.instance.seekProgress?.(local);
        child.started = shouldStart;
        child.completed = local >= 1;
      }
    } else
      for (const child of ordered) {
        if (!child.started) child.instance.play(this.#lastTimeMs ?? 0);
        child.instance.seekProgress?.(normalized);
        child.started = true;
        child.completed = normalized >= 1;
      }
    this.#state = normalized >= 1 ? "completed" : this.#state;
    return this.snapshot();
  }

  public reverse(): void {
    this.#assertUsable();
    this.#manuallyReversed = !this.#manuallyReversed;
    for (const child of this.#children) child.instance.reverse?.();
    this.#fallback?.reverse?.();
  }

  public setPlaybackRate(rate: number): void {
    this.#assertUsable();
    if (!Number.isFinite(rate) || rate < 0)
      throw this.#configurationError("Composite playback rate must be finite and non-negative.");
    this.#playbackRate = rate;
    for (const child of this.#children) child.instance.setPlaybackRate?.(rate);
    this.#fallback?.setPlaybackRate?.(rate);
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    for (const child of this.#children) child.instance.dispose();
    this.#fallback?.dispose();
    this.#state = "disposed";
    this.#startTimeMs = undefined;
    this.#lastTimeMs = undefined;
    this.#resumePending = false;
    this.#fallback = undefined;
  }

  public snapshot(): CompositeSnapshot {
    const active = this.#children.filter(
      (child) => child.started && !child.completed && !child.failed
    );
    const completed = this.#children.filter((child) => child.completed || child.skipped);
    const progress =
      this.#children.reduce(
        (total, child) =>
          total +
          (child.completed || child.skipped
            ? 1
            : clampProgress(child.instance.snapshot().progress)),
        0
      ) / this.#children.length;
    return Object.freeze({
      id: this.#id,
      type: this.#type,
      state: this.#state,
      complete: this.#state === "completed",
      progress,
      iteration: this.#iteration,
      reversed: this.#isReversed(),
      playbackRate: this.#playbackRate,
      activeChildIds: Object.freeze(active.map((child) => child.id)),
      completedChildIds: Object.freeze(completed.map((child) => child.id)),
      remainingChildIds: Object.freeze(
        this.#children
          .filter((child) => !child.completed && !child.skipped)
          .map((child) => child.id)
      ),
      failureCount: this.#failureCount,
      retryCount: this.#retryCount
    });
  }

  public compositeChildren(): readonly CompositeChildInstance[] {
    return Object.freeze(this.#children.map((child) => child.instance));
  }

  #startEligible(elapsedMs: number, currentTimeMs: number): void {
    if (this.#type === "sequence") {
      const active = this.#children.some(
        (child) =>
          child.started && !child.completed && !child.failed && child.retryAtMs === undefined
      );
      if (active) return;
      const next = this.#executionOrder().find(
        (child) => !child.started && !child.skipped && !child.failed && elapsedMs >= child.offsetMs
      );
      if (next !== undefined) this.#start(next, currentTimeMs);
      return;
    }
    for (const child of this.#executionOrder())
      if (!child.started && !child.skipped && !child.failed && elapsedMs >= child.offsetMs)
        this.#start(child, currentTimeMs);
  }

  #start(child: ChildState, currentTimeMs: number): void {
    if (child.condition !== undefined) {
      let enabled = false;
      try {
        enabled = child.condition({ compositeId: this.#id, iteration: this.#iteration });
      } catch {
        this.#handleFailure(child, currentTimeMs);
        return;
      }
      if (!enabled) {
        child.skipped = true;
        return;
      }
    }
    child.instance.play(currentTimeMs);
    child.started = true;
  }

  #handleFailure(child: ChildState, currentTimeMs: number): void {
    child.failed = true;
    this.#failureCount += 1;
    if (this.#failurePolicy.kind === "stop") {
      for (const sibling of this.#children)
        if (sibling !== child && !sibling.completed) sibling.instance.cancel();
      this.#state = "failed";
      return;
    }
    if (
      this.#failurePolicy.kind === "retry" &&
      child.retryAttempts < this.#failurePolicy.maxAttempts
    ) {
      child.retryAttempts += 1;
      this.#retryCount += 1;
      const delay = this.#failurePolicy.delayMs ?? 0;
      const factor = this.#failurePolicy.backoffFactor ?? 1;
      child.retryAtMs = currentTimeMs + delay * Math.pow(factor, child.retryAttempts - 1);
      return;
    }
    if (this.#failurePolicy.kind === "retry" && this.#failurePolicy.fallback !== undefined) {
      this.#fallback = this.#failurePolicy.fallback;
      this.#fallback.play(currentTimeMs);
      this.#fallbackActive = true;
    }
  }

  #processRetries(currentTimeMs: number): void {
    for (const child of this.#children) {
      if (child.retryAtMs === undefined || currentTimeMs < child.retryAtMs) continue;
      child.instance.reset?.();
      if (child.instance.reset === undefined) child.instance.restart();
      else child.instance.play(currentTimeMs);
      child.failed = false;
      child.started = true;
      child.retryAtMs = undefined;
    }
  }

  #updateFallback(currentTimeMs: number): CompositeSnapshot {
    try {
      if (this.#fallback?.update(currentTimeMs).complete === true) this.#state = "completed";
    } catch {
      this.#state = "failed";
      this.#failureCount += 1;
    }
    return this.snapshot();
  }

  #completeOrRepeat(currentTimeMs: number): CompositeSnapshot {
    const anotherIteration =
      this.#repeat.kind === "infinite" ||
      (this.#repeat.kind === "count" && this.#iteration + 1 < this.#repeat.count);
    if (!anotherIteration) {
      this.#state = "completed";
      return this.snapshot();
    }
    this.#iteration += 1;
    for (const child of this.#children) this.#resetChild(child);
    this.#startTimeMs = currentTimeMs;
    this.#applyIterationDirection();
    this.#startEligible(0, currentTimeMs);
    return this.snapshot();
  }

  #resetChild(child: ChildState): void {
    if (child.instance.reset !== undefined) child.instance.reset();
    else {
      child.instance.restart();
      child.instance.pause();
    }
    child.started = false;
    child.completed = false;
    child.skipped = false;
    child.failed = false;
    child.retryAttempts = 0;
    child.retryAtMs = undefined;
  }

  #applyIterationDirection(): void {
    const shouldReverse =
      this.#direction === "reverse" ||
      (this.#direction === "alternate" && this.#iteration % 2 === 1) ||
      (this.#direction === "alternate-reverse" && this.#iteration % 2 === 0);
    if (shouldReverse !== this.#manuallyReversed) {
      for (const child of this.#children) child.instance.reverse?.();
    }
  }

  #executionOrder(): readonly ChildState[] {
    return this.#isReversed() ? [...this.#children].reverse() : this.#children;
  }

  #isReversed(): boolean {
    const iterationReversed =
      this.#direction === "reverse" ||
      (this.#direction === "alternate" && this.#iteration % 2 === 1) ||
      (this.#direction === "alternate-reverse" && this.#iteration % 2 === 0);
    return iterationReversed !== this.#manuallyReversed;
  }

  #assertNestedAcyclic(): void {
    const root: CompositeGraphNode = {
      id: this.#id,
      children: this.#children.map((child) => this.#asGraphNode(child.instance, new Map()))
    };
    validateCompositeGraph(root);
  }

  #asGraphNode(
    instance: CompositeChildInstance,
    cache: Map<CompositeChildInstance, CompositeGraphNode>
  ): CompositeGraphNode {
    const existing = cache.get(instance);
    if (existing !== undefined) return existing;
    const node: { id: string; children: CompositeGraphNode[] } = {
      id: instance.snapshot().state ?? "animation-child",
      children: []
    };
    cache.set(instance, node);
    node.children.push(
      ...(instance.compositeChildren?.() ?? []).map((child) => this.#asGraphNode(child, cache))
    );
    return node;
  }

  #validateConfiguration(configuration: Readonly<CompositeConfiguration>): void {
    if (
      !Number.isFinite(this.#delayMs) ||
      this.#delayMs < 0 ||
      !Number.isFinite(configuration.staggerMs ?? 0) ||
      (configuration.staggerMs ?? 0) < 0
    )
      throw this.#configurationError("Composite delay values must be non-negative.");
    if (
      this.#repeat.kind === "count" &&
      (!Number.isInteger(this.#repeat.count) || this.#repeat.count <= 0)
    )
      throw this.#configurationError("Composite repeat count must be a positive integer.");
    if (this.#failurePolicy.kind === "retry") {
      if (!Number.isInteger(this.#failurePolicy.maxAttempts) || this.#failurePolicy.maxAttempts < 0)
        throw this.#configurationError("Retry attempts must be a non-negative integer.");
      if (
        !Number.isFinite(this.#failurePolicy.delayMs ?? 0) ||
        (this.#failurePolicy.delayMs ?? 0) < 0 ||
        !Number.isFinite(this.#failurePolicy.backoffFactor ?? 1) ||
        (this.#failurePolicy.backoffFactor ?? 1) < 1
      )
        throw this.#configurationError("Retry timing is invalid.");
    }
  }

  #assertUsable(): void {
    if (this.#state === "disposed")
      throw new AnimationDisposedError("Animation composite is disposed.", {
        code: "ANIMATION_INSTANCE_DISPOSED",
        animationId: this.#id
      });
  }

  #validateTime(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < 0)
      throw this.#configurationError("Composite time must be finite and non-negative.");
  }

  #configurationError(message: string): AnimationValidationError {
    return new AnimationValidationError(message, {
      code: "INVALID_ANIMATION_CONFIGURATION",
      animationId: this.#id
    });
  }

  #lifecycleError(message: string): AnimationLifecycleError {
    return new AnimationLifecycleError(message, {
      code: "INVALID_LIFECYCLE_STATE",
      animationId: this.#id
    });
  }
}
