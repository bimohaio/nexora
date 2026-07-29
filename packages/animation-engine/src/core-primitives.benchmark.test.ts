import { describe, expect, it } from "vitest";
import {
  AnimationComposite,
  AnimationTimeline,
  interpolateNumber,
  normalizePrimitiveTiming,
  sampleTimeline
} from "./index.js";
import type { CompositeChildInstance } from "./index.js";

describe("core animation primitive deterministic scaling benchmarks", () => {
  it("samples 10,000 simultaneous timelines with stable progress", () => {
    const timelines = Array.from(
      { length: 10_000 },
      () => new AnimationTimeline({ durationMs: 1_000 })
    );
    for (const timeline of timelines) timeline.start(0);
    const progress = timelines.reduce(
      (total, timeline) => total + timeline.update(500).progress,
      0
    );
    expect(progress).toBe(5_000);
  });

  it("performs 100,000 value interpolations without invalid output", () => {
    let checksum = 0;
    for (let index = 0; index < 100_000; index += 1)
      checksum += interpolateNumber(-1, 1, (index % 101) / 100);
    expect(Number.isFinite(checksum)).toBe(true);
  });

  it("does not drift when sampling a long-running infinite timeline", () => {
    const timing = normalizePrimitiveTiming({
      durationMs: 10,
      repeat: { kind: "infinite" }
    });
    const first = sampleTimeline(timing, 86_400_000);
    const second = sampleTimeline(timing, 86_400_000);
    expect(first).toEqual(second);
    expect(first.progress).toBe(0);
  });

  it("coordinates 10,000 composite children deterministically", () => {
    const child = (): CompositeChildInstance => {
      let progress = 0;
      return {
        play: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        cancel: () => undefined,
        reset: () => {
          progress = 0;
        },
        restart: () => undefined,
        dispose: () => undefined,
        update: () => {
          progress = 1;
          return { complete: true };
        },
        snapshot: () => ({ progress })
      };
    };
    const composite = new AnimationComposite({
      id: "benchmark-composite",
      type: "parallel",
      children: Array.from({ length: 10_000 }, (_, index) => ({
        id: `child-${String(index)}`,
        instance: child()
      }))
    });
    composite.play(0);
    expect(composite.update(1)).toMatchObject({ state: "completed", progress: 1 });
  });
});
