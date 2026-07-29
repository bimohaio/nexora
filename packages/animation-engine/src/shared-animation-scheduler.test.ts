import { describe, expect, it, vi } from "vitest";
import { ManualAnimationClock } from "./clock.js";
import { ManualAnimationFrameDriver } from "./frame-drivers.js";
import { SharedAnimationScheduler } from "./shared-animation-scheduler.js";
import type {
  AnimationFrameContext,
  AnimationInvalidationBatch,
  AnimationTask,
  AnimationTaskId
} from "./scheduler-contracts.js";

const id = (value: string): AnimationTaskId => value as AnimationTaskId;

function fixture(
  overrides: Partial<ConstructorParameters<typeof SharedAnimationScheduler>[0]> = {}
): {
  readonly clock: ManualAnimationClock;
  readonly driver: ManualAnimationFrameDriver;
  readonly scheduler: SharedAnimationScheduler;
} {
  const clock = new ManualAnimationClock();
  const driver = new ManualAnimationFrameDriver();
  return {
    clock,
    driver,
    scheduler: new SharedAnimationScheduler({
      id: "test-scheduler",
      timeSource: clock,
      frameDriver: driver,
      ...overrides
    })
  };
}

describe("SharedAnimationScheduler construction and driving", () => {
  it("starts without work and requests at most one frame for multiple registrations", () => {
    const { driver, scheduler } = fixture();
    expect(scheduler.getSnapshot().pendingFrameCount).toBe(0);
    scheduler.register({ update: () => undefined });
    scheduler.register({ update: () => undefined });
    scheduler.start();
    scheduler.requestFrame();
    expect(driver.pendingCount).toBe(1);
    expect(scheduler.getSnapshot().statistics.totalRegistrations).toBe(2);
  });

  it("validates options without mutating them", () => {
    const clock = new ManualAnimationClock();
    const driver = new ManualAnimationFrameDriver();
    const options = Object.freeze({ timeSource: clock, frameDriver: driver, playbackRate: 0.5 });
    expect(() => new SharedAnimationScheduler(options)).not.toThrow();
    expect(options.playbackRate).toBe(0.5);
    expect(
      () =>
        new SharedAnimationScheduler({
          timeSource: clock,
          frameDriver: driver,
          maxDeltaMs: 0
        })
    ).toThrow(RangeError);
  });

  it("coalesces external wake-ups and ignores stale callbacks", () => {
    const { driver, scheduler } = fixture();
    const update = vi.fn();
    scheduler.register({ update });
    scheduler.requestFrame();
    scheduler.requestFrame();
    scheduler.pause();
    expect(driver.pendingCount).toBe(0);
    expect(driver.fireLastCancelled(10)).toBe(true);
    expect(update).not.toHaveBeenCalled();
    scheduler.resume();
    expect(driver.pendingCount).toBe(1);
  });
});

describe("SharedAnimationScheduler deterministic dispatch", () => {
  it("orders priority then registration and starts reentrant registration next frame", () => {
    const { driver, scheduler } = fixture();
    const calls: string[] = [];
    scheduler.register({
      id: id("normal"),
      priority: "runtime",
      update: () => {
        calls.push("normal");
        scheduler.register({
          id: id("new"),
          priority: "critical-alarm",
          update: () => {
            calls.push("new");
            return { status: "complete" };
          }
        });
        return { status: "complete" };
      }
    });
    scheduler.register({
      id: id("critical"),
      priority: "critical-alarm",
      update: () => {
        calls.push("critical");
        return { status: "complete" };
      }
    });
    driver.fireFrame(10);
    expect(calls).toEqual(["critical", "normal"]);
    driver.fireFrame(20);
    expect(calls).toEqual(["critical", "normal", "new"]);
  });

  it("reserves IDs during dispatch so duplicate reentrant registration is rejected", () => {
    const { driver, scheduler } = fixture();
    scheduler.register({
      update: () => {
        scheduler.register({ id: id("queued"), update: () => undefined });
        expect(() => scheduler.register({ id: id("queued"), update: () => undefined })).toThrow(
          /already registered/
        );
        return { status: "complete" };
      }
    });
    driver.fireFrame(10);
    expect(scheduler.getSnapshot().activeTaskIds).toContain("queued");
  });

  it("uses finite clamped delta, scaled elapsed time, and resets baseline after pause", () => {
    const { driver, scheduler } = fixture({ maxDeltaMs: 20, playbackRate: 2 });
    const frames: AnimationFrameContext[] = [];
    scheduler.register({
      update: (context) => {
        frames.push(context);
      }
    });
    driver.fireFrame(10);
    driver.fireFrame(60);
    scheduler.pause();
    scheduler.resume();
    driver.fireFrame(1_000);
    expect(frames.map(({ deltaTime }) => deltaTime)).toEqual([0, 40, 0]);
    expect(frames[1]).toMatchObject({
      unscaledDeltaTime: 20,
      elapsedTime: 40,
      deltaClamped: true
    });
    expect(scheduler.getSnapshot().statistics.clampedDeltaCount).toBe(1);
  });

  it("clamps backwards and non-finite timestamps with diagnostics", () => {
    const { driver, scheduler } = fixture();
    const deltas: number[] = [];
    scheduler.register({
      update: ({ deltaTime }) => {
        deltas.push(deltaTime);
      }
    });
    driver.fireFrames([10, 5, Number.NaN]);
    expect(deltas.every(Number.isFinite)).toBe(true);
    expect(deltas.every((value) => value >= 0)).toBe(true);
    expect(scheduler.getSnapshot().diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["ANIMATION_TIME_MOVED_BACKWARD", "ANIMATION_INVALID_TIMESTAMP"])
    );
  });
});

describe("SharedAnimationScheduler tasks and invalidations", () => {
  it("deduplicates invalidations and commits exactly one readonly batch", () => {
    const batches: AnimationInvalidationBatch[] = [];
    const commit = (batch: AnimationInvalidationBatch): void => {
      batches.push(batch);
    };
    const { driver, scheduler } = fixture({ invalidationSink: { commit } });
    const invalidation = { targetType: "symbol" as const, targetId: "pump", reason: "motion" };
    scheduler.register({
      update: () => ({ status: "complete", invalidations: [invalidation, invalidation] })
    });
    scheduler.register({
      update: () => ({ status: "complete", invalidations: [invalidation] })
    });
    driver.fireFrame(10);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.invalidations).toEqual([invalidation]);
    expect(Object.isFrozen(batches[0]?.invalidations)).toBe(true);
    expect(scheduler.getSnapshot().statistics).toMatchObject({
      totalInvalidations: 1,
      totalCommittedBatches: 1
    });
  });

  it("isolates task and sink failures while continuing other tasks", () => {
    const second = vi.fn();
    const { driver, scheduler } = fixture({
      invalidationSink: {
        commit: () => {
          throw new Error("sink");
        }
      }
    });
    const failed = scheduler.register({
      id: id("failed"),
      update: () => {
        throw new Error("task");
      }
    });
    scheduler.register({
      update: () => {
        second();
        return {
          invalidations: [{ targetType: "node", targetId: "pump" }]
        };
      }
    });
    driver.fireFrame(10);
    expect(second).toHaveBeenCalledTimes(1);
    expect(failed.state).toBe("failed");
    expect(scheduler.getSnapshot().diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["ANIMATION_TASK_UPDATE_FAILED", "ANIMATION_BATCH_COMMIT_FAILED"])
    );
  });

  it("supports pause, resume, cancel and idempotent disposal hooks", () => {
    const { driver, scheduler } = fixture();
    const update = vi.fn();
    const onDispose = vi.fn();
    const handle = scheduler.register({ update, onDispose });
    handle.pause();
    driver.fireFrame(10);
    expect(update).not.toHaveBeenCalled();
    handle.resume();
    driver.fireFrame(20);
    expect(update).toHaveBeenCalledTimes(1);
    handle.dispose();
    handle.dispose();
    handle.resume();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(handle.state).toBe("disposed");
  });

  it("allows self-disposal and skips a later cancelled task", () => {
    const { driver, scheduler } = fixture();
    const later = vi.fn();
    const other = scheduler.register({ id: id("other"), update: later });
    const self = scheduler.register({
      id: id("self"),
      priority: "critical-alarm",
      update: () => {
        self.dispose();
        other.dispose();
      }
    });
    driver.fireFrame(10);
    expect(later).not.toHaveBeenCalled();
  });
});

describe("SharedAnimationScheduler policies and lifecycle", () => {
  it("suppresses disabled reduced-motion tasks and resumes deterministically", () => {
    const { driver, scheduler } = fixture({ reducedMotion: "reduce" });
    const disabled = vi.fn();
    const essential = vi.fn();
    scheduler.register({ motionBehavior: "disable", update: disabled });
    scheduler.register({ motionBehavior: "allow", update: essential });
    driver.fireFrame(10);
    expect(disabled).not.toHaveBeenCalled();
    expect(essential).toHaveBeenCalledTimes(1);
    scheduler.setReducedMotion("no-preference");
    driver.fireFrame(20);
    expect(disabled).toHaveBeenCalledTimes(1);
  });

  it("does not drive empty frames when every task is reduced-motion-disabled", () => {
    const { driver, scheduler } = fixture({ reducedMotion: "reduce" });
    scheduler.register({ motionBehavior: "disable", update: vi.fn() });
    expect(driver.pendingCount).toBe(0);
    scheduler.setReducedMotion("no-preference");
    expect(driver.pendingCount).toBe(1);
  });

  it("dispatches a static final state once and wakes it after reduced motion is disabled", () => {
    const { driver, scheduler } = fixture({ reducedMotion: "reduce" });
    const update = vi.fn();
    const handle = scheduler.register({ motionBehavior: "static-final-state", update });
    driver.fireFrame(10);
    expect(update).toHaveBeenCalledTimes(1);
    expect(handle.state).toBe("paused");
    expect(driver.pendingCount).toBe(0);
    scheduler.setReducedMotion("no-preference");
    driver.fireFrame(20);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("stops hidden-page driving and avoids a catch-up delta after visibility returns", () => {
    const { driver, scheduler } = fixture();
    const deltas: number[] = [];
    scheduler.register({
      update: ({ deltaTime }) => {
        deltas.push(deltaTime);
      }
    });
    driver.fireFrame(10);
    scheduler.setVisibility("document-hidden");
    expect(driver.pendingCount).toBe(0);
    scheduler.setVisibility("visible");
    driver.fireFrame(1_000);
    expect(deltas).toEqual([0, 0]);
  });

  it("disposal during dispatch stops later tasks and suppresses the batch", () => {
    const commit = vi.fn();
    const later = vi.fn();
    const { driver, scheduler } = fixture({ invalidationSink: { commit } });
    scheduler.register({
      priority: "critical-alarm",
      update: () => {
        scheduler.dispose();
        return { invalidations: [{ targetType: "node", targetId: "pump" }] };
      }
    });
    scheduler.register({ update: later });
    driver.fireFrame(10);
    expect(later).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(scheduler.state).toBe("disposed");
    expect(driver.pendingCount).toBe(0);
  });

  it("isolates scheduler instances with overlapping IDs", () => {
    const first = fixture();
    const second = fixture();
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();
    first.scheduler.register({ id: id("same"), update: firstUpdate });
    second.scheduler.register({ id: id("same"), update: secondUpdate });
    first.scheduler.dispose();
    second.driver.fireFrame(10);
    expect(firstUpdate).not.toHaveBeenCalled();
    expect(secondUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate live IDs without changing the existing task", () => {
    const { driver, scheduler } = fixture();
    const existing = vi.fn();
    scheduler.register({ id: id("duplicate"), update: existing });
    expect(() => scheduler.register({ id: id("duplicate"), update: vi.fn() })).toThrow(
      /already registered/
    );
    expect(driver.pendingCount).toBe(1);
    driver.fireFrame(10);
    expect(existing).toHaveBeenCalledTimes(1);
  });
});

describe("SharedAnimationScheduler stress", () => {
  it("dispatches 10,000 tasks through one driver request and releases completed entries", () => {
    const { driver, scheduler } = fixture();
    let calls = 0;
    const task: AnimationTask = {
      update: () => {
        calls += 1;
        return { status: "complete" };
      }
    };
    for (let index = 0; index < 10_000; index += 1) scheduler.register(task);
    expect(driver.pendingCount).toBe(1);
    driver.fireFrame(10);
    expect(calls).toBe(10_000);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(0);
    expect(driver.pendingCount).toBe(0);
  });
});
