import { describe, expect, it } from "vitest";
import {
  AnimationTimeline,
  InterpolationRegistry,
  interpolateAngle,
  interpolateColor,
  interpolateDiscrete,
  interpolateInteger,
  interpolateMatrix2D,
  interpolateNumber,
  interpolateOpacity,
  interpolateTransform,
  interpolateVector2,
  normalizeAngle,
  normalizePrimitiveTiming,
  sampleTimeline
} from "./index.js";

describe("core animation interpolation", () => {
  it("interpolates numbers, integers, discrete values and opacity deterministically", () => {
    expect(interpolateNumber(-10, 10, 0.5)).toBe(0);
    expect(interpolateNumber(0, 10, -1)).toBe(0);
    expect(interpolateNumber(0, 10, 2)).toBe(10);
    expect(interpolateInteger(-2, -1, 0.5)).toBe(-2);
    expect(interpolateDiscrete(false, true, 0.499)).toBe(false);
    expect(interpolateDiscrete(false, true, 0.5)).toBe(true);
    expect(interpolateOpacity(-1, 2, 0.5)).toBe(0.5);
    expect(() => interpolateNumber(Number.NaN, 1, 0.5)).toThrow(/finite/);
  });

  it("interpolates immutable canonical colors and neutral vector/matrix values", () => {
    const from = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
    expect(interpolateColor(from, { r: 255, g: 127, b: 1, a: 1 }, 0.5)).toEqual({
      r: 128,
      g: 64,
      b: 1,
      a: 0.5
    });
    expect(interpolateVector2({ x: -1, y: 1 }, { x: 1, y: 3 }, 0.5)).toEqual({
      x: 0,
      y: 2
    });
    expect(
      interpolateMatrix2D(
        { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        { a: 2, b: 2, c: 2, d: 2, e: 10, f: 20 },
        0.5
      )
    ).toEqual({ a: 1.5, b: 1, c: 1, d: 1.5, e: 5, f: 10 });
    expect(from).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("defines angle wrapping, shortest-path tie and transform defaults", () => {
    expect(normalizeAngle(-10)).toBe(350);
    expect(interpolateAngle(350, 10, 0.5, "shortest")).toBe(360);
    expect(interpolateAngle(10, 350, 0.5, "shortest")).toBe(0);
    expect(interpolateAngle(0, 180, 0.5, "shortest")).toBe(90);
    expect(interpolateTransform({}, { translation: { x: 10, y: 20 } }, 0.5)).toEqual({
      translation: { x: 5, y: 10 },
      rotationDeg: 0,
      scale: { x: 1, y: 1 },
      skew: { x: 0, y: 0 },
      order: ["translation", "rotation", "skew", "scale"]
    });
  });

  it("supports isolated custom interpolation registration and failure containment", () => {
    const registry = new InterpolationRegistry();
    registry.register("custom-half", (progress) => progress / 2);
    expect(registry.resolve("custom-half")(1)).toBe(0.5);
    expect(() => {
      registry.register("linear", (value) => value);
    }).toThrow();
    expect(() => registry.resolve("missing")).toThrow(/not registered/);
    registry.register("broken", () => Number.NaN);
    expect(() => registry.resolve("broken")(0.5)).toThrow(/failed/);
    expect(registry.unregister("linear")).toBe(false);
    expect(registry.unregister("custom-half")).toBe(true);
  });
});

describe("animation timeline", () => {
  it("normalizes defaults and rejects invalid timing", () => {
    expect(normalizePrimitiveTiming({ durationMs: 100 })).toMatchObject({
      durationMs: 100,
      delayMs: 0,
      endDelayMs: 0,
      playbackRate: 1,
      direction: "normal",
      fillMode: "none",
      iterations: 1
    });
    expect(() => normalizePrimitiveTiming({ durationMs: -1 })).toThrow();
    expect(() =>
      normalizePrimitiveTiming({
        durationMs: 1,
        repeat: { kind: "count", count: 0 }
      })
    ).toThrow();
  });

  it("samples delay, repeat boundaries, direction, fill and end delay", () => {
    const timing = normalizePrimitiveTiming({
      durationMs: 100,
      delayMs: 10,
      endDelayMs: 20,
      repeat: { kind: "count", count: 2 },
      direction: "alternate",
      fillMode: "both"
    });
    expect(sampleTimeline(timing, 0)).toMatchObject({
      state: "waiting-delay",
      progress: 0,
      valueOwned: true
    });
    expect(sampleTimeline(timing, 60)).toMatchObject({
      iteration: 0,
      progress: 0.5,
      directedProgress: 0.5
    });
    expect(sampleTimeline(timing, 160)).toMatchObject({
      iteration: 1,
      progress: 0.5,
      directedProgress: 0.5
    });
    expect(sampleTimeline(timing, 210)).toMatchObject({
      state: "completed",
      progress: 1,
      directedProgress: 0,
      complete: false,
      valueOwned: true
    });
    expect(sampleTimeline(timing, 230).complete).toBe(true);
  });

  it("is frame-independent and pause/resume does not jump", () => {
    const oneFrame = new AnimationTimeline({ durationMs: 1000 });
    oneFrame.start(0);
    oneFrame.update(1000);
    const manyFrames = new AnimationTimeline({ durationMs: 1000 });
    manyFrames.start(0);
    for (let time = 10; time <= 1000; time += 10) manyFrames.update(time);
    expect(oneFrame.snapshot().progress).toBe(manyFrames.snapshot().progress);

    const paused = new AnimationTimeline({ durationMs: 1000, delayMs: 100 });
    paused.start(0);
    paused.update(50);
    paused.pause(60);
    expect(paused.update(500).elapsedTimeMs).toBe(60);
    paused.resume(500);
    expect(paused.update(510).elapsedTimeMs).toBe(70);
  });

  it("supports seek, reverse, reset, cancellation and disposal", () => {
    const timeline = new AnimationTimeline({
      durationMs: 100,
      repeat: { kind: "count", count: 2 }
    });
    expect(timeline.seekProgress(0.75)).toMatchObject({ iteration: 1, progress: 0.5 });
    timeline.reverse();
    timeline.start(1000);
    expect(timeline.update(1010).elapsedTimeMs).toBe(140);
    expect(timeline.reset().progress).toBe(0);
    timeline.cancel();
    expect(() => timeline.update(1020)).toThrow(/cancelled/);

    const disposed = new AnimationTimeline({ durationMs: 10 });
    disposed.dispose();
    disposed.dispose();
    expect(() => disposed.snapshot()).toThrow(/disposed/);
  });

  it("updates playback rate without using negative speed for reverse", () => {
    const timeline = new AnimationTimeline({ durationMs: 100 });
    timeline.start(0);
    timeline.setPlaybackRate(2);
    expect(timeline.update(25).progress).toBe(0.5);
    timeline.setPlaybackRate(0);
    expect(timeline.update(50).progress).toBe(0.5);
    expect(() => {
      timeline.setPlaybackRate(-1);
    }).toThrow(/non-negative/);
  });

  it("handles zero duration and infinite repetition without NaN", () => {
    const zero = sampleTimeline(normalizePrimitiveTiming({ durationMs: 0 }), 0);
    expect(zero.progress).toBe(1);
    expect(Number.isNaN(zero.progress)).toBe(false);
    const infinite = sampleTimeline(
      normalizePrimitiveTiming({ durationMs: 10, repeat: { kind: "infinite" } }),
      1_000_005
    );
    expect(infinite.complete).toBe(false);
    expect(infinite.progress).toBe(0.5);
  });
});
