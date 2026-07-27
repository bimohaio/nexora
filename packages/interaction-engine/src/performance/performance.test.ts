import { describe, expect, it, vi } from "vitest";
import { InteractionBatch } from "../batching/index.js";
import { RevisionedCache, TransformCache } from "../cache/index.js";
import { InteractionPerformanceMetrics } from "../metrics/index.js";
import { InteractionObjectPools } from "../pool/index.js";
import { InteractionProfiler } from "../profiling/index.js";
import {
  InteractionPerformanceScheduler,
  type InteractionPerformanceSchedulerOptions
} from "../scheduler/index.js";
import type { SchedulerTimingAdapter } from "../types/performance.js";
import { InteractionEventQueue } from "../utils/index.js";

function manualTiming(): {
  readonly timing: SchedulerTimingAdapter;
  readonly run: () => void;
  readonly advance: (amount: number) => void;
} {
  let pending: (() => void) | undefined;
  let now = 0;
  const schedule = (task: () => void): { cancel(): void } => {
    pending = task;
    return {
      cancel: () => {
        pending = undefined;
      }
    };
  };
  return {
    timing: {
      frame: schedule,
      microtask: schedule,
      macrotask: schedule,
      idle: schedule,
      now: () => now
    },
    run: () => {
      const task = pending;
      pending = undefined;
      task?.();
    },
    advance: (amount) => {
      now += amount;
    }
  };
}

describe("interaction performance foundation", () => {
  it("prioritizes, coalesces, cancels obsolete work, and respects frame scheduling", () => {
    const clock = manualTiming();
    const calls: string[] = [];
    const options: InteractionPerformanceSchedulerOptions = {
      timing: clock.timing,
      frameBudgetMs: 16
    };
    const scheduler = new InteractionPerformanceScheduler(options);
    scheduler.scheduleWork({
      id: "old-move",
      coalesceKey: "pointer:1",
      execute: () => calls.push("old")
    });
    scheduler.scheduleWork({
      id: "new-move",
      coalesceKey: "pointer:1",
      execute: () => calls.push("new")
    });
    scheduler.scheduleWork({
      id: "normal",
      obsoleteKey: "selection",
      execute: () => calls.push("obsolete")
    });
    scheduler.scheduleWork({
      id: "replacement",
      obsoleteKey: "selection",
      priority: "critical",
      execute: () => calls.push("critical")
    });
    expect(scheduler.queueLength).toBe(2);
    clock.run();
    expect(calls).toEqual(["critical", "new"]);
    expect(scheduler.queueLength).toBe(0);
  });

  it("coalesces queue and batch entries deterministically", () => {
    const consumed = vi.fn();
    const queue = new InteractionEventQueue<{ readonly kind: string; readonly value: number }>(
      consumed,
      undefined,
      {
        coalesceKey: ({ kind }) => kind
      }
    );
    queue.enqueue({ kind: "pointer", value: 1 });
    queue.enqueue({ kind: "pointer", value: 2 });
    queue.enqueue({ kind: "focus", value: 3 });
    queue.flush();
    expect(consumed).toHaveBeenCalledWith([
      { kind: "pointer", value: 2 },
      { kind: "focus", value: 3 }
    ]);

    const batch = new InteractionBatch<number>();
    batch.registerReducer("selection", (_previous, next) => next);
    batch.add({ kind: "selection", key: "canvas", value: 1 });
    batch.add({ kind: "selection", key: "canvas", value: 2 });
    batch.add({ kind: "focus", key: "node", value: 3, priority: 10 });
    expect(batch.flush()).toEqual([
      { kind: "focus", key: "node", value: 3, priority: 10 },
      { kind: "selection", key: "canvas", value: 2 }
    ]);
  });

  it("invalidates revision caches, evicts deterministically, and caches matrix inversions", () => {
    const cache = new RevisionedCache<string, number>(2);
    cache.set("a", 1, 1);
    cache.set("b", 2, 1);
    expect(cache.get("a", 1)).toBe(1);
    cache.set("c", 3, 1);
    expect(cache.get("b", 1)).toBeUndefined();
    expect(cache.get("a", 2)).toBeUndefined();
    expect(cache.statistics()).toEqual(
      expect.objectContaining({ evictions: 1, size: 0, revision: 2 })
    );
    const transforms = new TransformCache();
    const matrix = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
    expect(transforms.inverse(matrix)).toBe(transforms.inverse(matrix));
    expect(transforms.statistics().hitRatio).toBe(0.5);
  });

  it("reuses callback-scoped pooled values without leaking previous state", () => {
    const allocation = vi.fn();
    const pools = new InteractionObjectPools(allocation);
    expect(
      pools.withVector((value) => {
        value.x = 10;
        return value.x;
      })
    ).toBe(10);
    expect(pools.withVector((value) => value.x)).toBe(0);
    expect(allocation).toHaveBeenCalledOnce();
  });

  it("profiles spans and publishes stable metrics", () => {
    let now = 0;
    const profiler = new InteractionProfiler({ enabled: true, now: () => now });
    const end = profiler.begin("dispatch", { type: "pointer-move" });
    now = 4;
    expect(end()?.duration).toBe(4);
    expect(end()).toBeUndefined();
    const metrics = new InteractionPerformanceMetrics();
    metrics.recordEvent(2, 1);
    metrics.recordFrame(10);
    metrics.recordScheduler(3, 12);
    metrics.recordAllocation(2);
    metrics.recordCache({ hits: 9, misses: 1, evictions: 0, size: 1, hitRatio: 0.9, revision: 1 });
    expect(metrics.snapshot()).toEqual({
      eventCount: 1,
      averageEventLatency: 2,
      averageDispatchDuration: 1,
      averageSchedulerDuration: 3,
      cacheHitRatio: 0.9,
      allocationCount: 2,
      averageFrameTime: 10,
      maximumQueueLength: 12,
      interactionFps: 100,
      droppedFrames: 0
    });
  });
});
