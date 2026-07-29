import type { AnimationDirection, AnimationFillMode } from "./contracts.js";
import { AnimationDisposedError, AnimationTimingError } from "./errors.js";
import { clampProgress } from "./interpolation.js";
import type { PrimitiveRepeatMode, PrimitiveTiming } from "./primitive-contracts.js";

export type TimelineState =
  | "created"
  | "waiting-delay"
  | "running"
  | "paused"
  | "seeking"
  | "repeating"
  | "completed"
  | "cancelled"
  | "disposed";

export interface NormalizedPrimitiveTiming {
  readonly durationMs: number;
  readonly delayMs: number;
  readonly endDelayMs: number;
  readonly playbackRate: number;
  readonly direction: AnimationDirection;
  readonly fillMode: AnimationFillMode;
  readonly repeat: PrimitiveRepeatMode;
  readonly iterations: number;
  readonly activeDurationMs: number;
  readonly totalDurationMs: number;
}

export interface TimelineSample {
  readonly state: TimelineState;
  readonly elapsedTimeMs: number;
  readonly activeTimeMs: number;
  readonly progress: number;
  readonly directedProgress: number;
  readonly iteration: number;
  readonly active: boolean;
  readonly complete: boolean;
  readonly valueOwned: boolean;
}

export function normalizePrimitiveTiming(
  timing: Readonly<PrimitiveTiming>
): NormalizedPrimitiveTiming {
  const durationMs = timing.durationMs;
  const delayMs = timing.delayMs ?? 0;
  const endDelayMs = timing.endDelayMs ?? 0;
  const playbackRate = timing.playbackRate ?? 1;
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new AnimationTimingError("Duration must be finite and non-negative.", {
      code: "INVALID_ANIMATION_CONFIGURATION"
    });
  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(endDelayMs) || endDelayMs < 0)
    throw new AnimationTimingError("Delay values must be finite and non-negative.", {
      code: "INVALID_ANIMATION_CONFIGURATION"
    });
  if (!Number.isFinite(playbackRate) || playbackRate < 0)
    throw new AnimationTimingError("Playback rate must be finite and non-negative.", {
      code: "INVALID_ANIMATION_CONFIGURATION"
    });
  const repeat = timing.repeat ?? { kind: "once" };
  if (repeat.kind === "count" && (!Number.isInteger(repeat.count) || repeat.count <= 0))
    throw new AnimationTimingError("Repeat count must be a positive integer.", {
      code: "INVALID_REPEAT_CONFIGURATION"
    });
  const iterations =
    repeat.kind === "once" ? 1 : repeat.kind === "count" ? repeat.count : Number.POSITIVE_INFINITY;
  const activeDurationMs = durationMs === 0 ? 0 : durationMs * iterations;
  return Object.freeze({
    durationMs,
    delayMs,
    endDelayMs,
    playbackRate,
    direction: timing.direction ?? "normal",
    fillMode: timing.fillMode ?? "none",
    repeat: Object.freeze({ ...repeat }),
    iterations,
    activeDurationMs,
    totalDurationMs: Number.isFinite(activeDurationMs)
      ? delayMs + activeDurationMs + endDelayMs
      : Infinity
  });
}

function directed(progress: number, iteration: number, direction: AnimationDirection): number {
  const reverse =
    direction === "reverse" ||
    (direction === "alternate" && iteration % 2 === 1) ||
    (direction === "alternate-reverse" && iteration % 2 === 0);
  return reverse ? 1 - progress : progress;
}

export function sampleTimeline(
  timing: Readonly<NormalizedPrimitiveTiming>,
  elapsedTimeMs: number
): TimelineSample {
  if (!Number.isFinite(elapsedTimeMs))
    throw new AnimationTimingError("Elapsed time must be finite.", { code: "INVALID_VALUE" });
  const elapsed = Math.max(0, elapsedTimeMs);
  const before = elapsed < timing.delayMs;
  const after =
    Number.isFinite(timing.activeDurationMs) && elapsed >= timing.delayMs + timing.activeDurationMs;
  let iteration = 0;
  let progress = 0;
  if (timing.durationMs === 0) {
    progress = before ? 0 : 1;
  } else if (after) {
    iteration = Math.max(0, timing.iterations - 1);
    progress = 1;
  } else if (!before) {
    const active = elapsed - timing.delayMs;
    iteration = Math.floor(active / timing.durationMs);
    progress = (active - iteration * timing.durationMs) / timing.durationMs;
  }
  const active = !before && !after;
  const valueOwned =
    active ||
    (before && ["backwards", "both"].includes(timing.fillMode)) ||
    (after && ["forwards", "both"].includes(timing.fillMode));
  return Object.freeze({
    state: before ? "waiting-delay" : after ? "completed" : "running",
    elapsedTimeMs: elapsed,
    activeTimeMs: Math.max(
      0,
      Math.min(
        elapsed - timing.delayMs,
        Number.isFinite(timing.activeDurationMs) ? timing.activeDurationMs : elapsed
      )
    ),
    progress: clampProgress(progress),
    directedProgress: clampProgress(directed(progress, iteration, timing.direction)),
    iteration,
    active,
    complete: after && elapsed >= timing.totalDurationMs,
    valueOwned
  });
}

export class AnimationTimeline {
  readonly timing: NormalizedPrimitiveTiming;
  #state: TimelineState = "created";
  #elapsedTimeMs = 0;
  #anchorTimeMs: number | undefined;
  #reversed = false;
  #playbackRate: number;

  public constructor(timing: Readonly<PrimitiveTiming>) {
    this.timing = normalizePrimitiveTiming(timing);
    this.#playbackRate = this.timing.playbackRate;
  }

  public start(currentTimeMs: number): TimelineSample {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state === "completed" || this.#state === "cancelled")
      throw new AnimationTimingError("A terminal timeline must be reset before start.", {
        code: "INVALID_LIFECYCLE_STATE"
      });
    if (this.#anchorTimeMs === undefined) this.#anchorTimeMs = currentTimeMs;
    this.#state = this.timing.delayMs > this.#elapsedTimeMs ? "waiting-delay" : "running";
    return this.#sampleElapsed();
  }

  public update(currentTimeMs: number): TimelineSample {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state === "paused") return this.#sampleElapsed();
    if (this.#anchorTimeMs === undefined) return this.start(currentTimeMs);
    const delta = Math.max(0, currentTimeMs - this.#anchorTimeMs);
    this.#anchorTimeMs = currentTimeMs;
    const scaled = delta * this.#playbackRate;
    this.#elapsedTimeMs = this.#reversed
      ? Math.max(0, this.#elapsedTimeMs - scaled)
      : this.#elapsedTimeMs + scaled;
    const sample = this.#sampleElapsed();
    this.#state = sample.complete ? "completed" : sample.state;
    return sample;
  }

  public pause(currentTimeMs: number): TimelineSample {
    const sample = this.update(currentTimeMs);
    if (this.#state !== "completed") {
      this.#state = "paused";
    }
    return sample;
  }

  public resume(currentTimeMs: number): TimelineSample {
    this.#assertUsable();
    this.#validateTime(currentTimeMs);
    if (this.#state !== "paused")
      throw new AnimationTimingError("Only a paused timeline can resume.", {
        code: "INVALID_LIFECYCLE_STATE"
      });
    this.#anchorTimeMs = currentTimeMs;
    this.#state = this.timing.delayMs > this.#elapsedTimeMs ? "waiting-delay" : "running";
    return this.#sampleElapsed();
  }

  public seek(timeMs: number): TimelineSample {
    this.#assertUsable();
    this.#validateTime(timeMs);
    const maximum = Number.isFinite(this.timing.totalDurationMs)
      ? this.timing.totalDurationMs
      : Number.MAX_SAFE_INTEGER;
    this.#elapsedTimeMs = Math.min(maximum, Math.max(0, timeMs));
    const sample = this.#sampleElapsed();
    if (this.#state !== "paused") this.#state = sample.complete ? "completed" : sample.state;
    return sample;
  }

  public seekRelative(deltaMs: number): TimelineSample {
    if (!Number.isFinite(deltaMs))
      throw new AnimationTimingError("Relative seek must be finite.", { code: "INVALID_VALUE" });
    return this.seek(this.#elapsedTimeMs + deltaMs);
  }

  public seekProgress(progress: number): TimelineSample {
    if (!Number.isFinite(progress))
      throw new AnimationTimingError("Seek progress must be finite.", { code: "INVALID_VALUE" });
    const activeDuration = Number.isFinite(this.timing.activeDurationMs)
      ? this.timing.activeDurationMs
      : this.timing.durationMs;
    return this.seek(this.timing.delayMs + clampProgress(progress) * activeDuration);
  }

  public reverse(): void {
    this.#assertUsable();
    this.#reversed = !this.#reversed;
  }

  public setPlaybackRate(rate: number): void {
    this.#assertUsable();
    if (!Number.isFinite(rate) || rate < 0)
      throw new AnimationTimingError("Playback rate must be finite and non-negative.", {
        code: "INVALID_VALUE"
      });
    this.#playbackRate = rate;
  }

  public cancel(): void {
    if (this.#state === "disposed" || this.#state === "cancelled") return;
    this.#state = "cancelled";
    this.#anchorTimeMs = undefined;
  }

  public reset(): TimelineSample {
    this.#assertUsable();
    this.#state = "created";
    this.#elapsedTimeMs = 0;
    this.#anchorTimeMs = undefined;
    this.#reversed = false;
    this.#playbackRate = this.timing.playbackRate;
    return this.#sampleElapsed();
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    this.#state = "disposed";
    this.#anchorTimeMs = undefined;
  }

  public snapshot(): TimelineSample {
    this.#assertUsable();
    return this.#sampleElapsed();
  }

  public get state(): TimelineState {
    return this.#state;
  }

  public get reversed(): boolean {
    return this.#reversed;
  }

  #sampleElapsed(): TimelineSample {
    const sampled = sampleTimeline(this.timing, this.#elapsedTimeMs);
    return Object.freeze({
      ...sampled,
      state: this.#state === "paused" ? "paused" : sampled.state
    });
  }

  #validateTime(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < 0)
      throw new AnimationTimingError("Timeline time must be finite and non-negative.", {
        code: "INVALID_VALUE"
      });
  }

  #assertUsable(): void {
    if (this.#state === "disposed")
      throw new AnimationDisposedError("Timeline is disposed.", {
        code: "ANIMATION_INSTANCE_DISPOSED"
      });
    if (this.#state === "cancelled")
      throw new AnimationTimingError("Timeline is cancelled.", {
        code: "INVALID_LIFECYCLE_STATE"
      });
  }
}
