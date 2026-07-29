import { describe, expect, it } from "vitest";
import { ManualAnimationClock } from "./clock.js";
import { ManualAnimationFrameDriver } from "./frame-drivers.js";
import { SharedAnimationScheduler } from "./shared-animation-scheduler.js";

describe("SharedAnimationScheduler benchmark", () => {
  it("registers, dispatches, batches, and completes 10,000 tasks", () => {
    const clock = new ManualAnimationClock();
    const driver = new ManualAnimationFrameDriver();
    const scheduler = new SharedAnimationScheduler({
      timeSource: clock,
      frameDriver: driver,
      invalidationSink: { commit: () => undefined }
    });
    for (let index = 0; index < 10_000; index += 1)
      scheduler.register({
        update: () => ({
          status: "complete",
          invalidations: [{ targetType: "animation-target", targetId: `target-${index % 1_000}` }]
        })
      });
    driver.fireFrame(16);
    expect(scheduler.getSnapshot().statistics).toMatchObject({
      totalRegistrations: 10_000,
      totalCallbackInvocations: 10_000,
      totalInvalidations: 1_000,
      totalCommittedBatches: 1
    });
    scheduler.dispose();
  });
});
