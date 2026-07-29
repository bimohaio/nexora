import { describe, expect, it, vi } from "vitest";
import {
  AnimationLifecycle,
  AnimationOwnershipRegistry,
  InMemoryAnimationTypeRegistry,
  asAnimationTypeId,
  resolveAnimationConflicts,
  validateAnimationDefinition,
  validateAnimationEasing,
  validateAnimationTiming
} from "./index.js";
import {
  ManualAnimationClock,
  ManualFrameScheduler,
  TestMotionPreferenceSource,
  TestVisibilityProvider,
  createTestAnimationDefinition
} from "./testing.js";
import type { AnimationInstanceId } from "./contracts.js";

const instance = (value: string): AnimationInstanceId => value as AnimationInstanceId;

describe("animation foundation", () => {
  it("validates built-in definitions and rejects unsafe or unknown configuration", () => {
    const registry = new InMemoryAnimationTypeRegistry();
    expect(validateAnimationDefinition(createTestAnimationDefinition(), registry).valid).toBe(true);
    expect(
      validateAnimationDefinition(
        createTestAnimationDefinition({
          type: asAnimationTypeId("custom"),
          parameters: { callback: () => undefined }
        }),
        registry
      ).issues.map(({ code }) => code)
    ).toEqual(expect.arrayContaining(["ANIMATION_TYPE_UNKNOWN", "ANIMATION_PARAMETERS_UNSAFE"]));
  });

  it("validates finite timing, playback rate and easing", () => {
    expect(validateAnimationTiming({ durationMs: -1, playbackRate: 0 }).valid).toBe(false);
    expect(
      validateAnimationEasing({ kind: "cubic-bezier", x1: -1, y1: 0, x2: 1, y2: 1 }).valid
    ).toBe(false);
  });

  it("enforces lifecycle transitions and idempotent disposal", () => {
    const lifecycle = new AnimationLifecycle(instance("one"));
    lifecycle.transition("scheduled");
    lifecycle.transition("running");
    lifecycle.pause();
    lifecycle.resume();
    lifecycle.cancel();
    lifecycle.dispose();
    lifecycle.dispose();
    expect(lifecycle.getState()).toBe("disposed");
    expect(() => {
      lifecycle.resume();
    }).not.toThrow();
  });

  it("disposes all owner registrations without affecting another owner", () => {
    const registry = new AnimationOwnershipRegistry();
    const first = new AnimationLifecycle(instance("first"));
    const second = new AnimationLifecycle(instance("second"));
    registry.register("renderer-a", first);
    registry.register("renderer-b", second);
    registry.disposeOwner("renderer-a");
    expect(first.getState()).toBe("disposed");
    expect(second.getState()).toBe("idle");
  });

  it("orders conflict winners by priority then stable registration order and ID", () => {
    const base = {
      entityId: "pump",
      target: { entityId: "pump", kind: "node" as const, property: "opacity" },
      value: 0.5
    };
    const resolved = resolveAnimationConflicts([
      { ...base, instanceId: instance("later"), priority: 10, registrationOrder: 2 },
      { ...base, instanceId: instance("earlier"), priority: 10, registrationOrder: 1 },
      { ...base, instanceId: instance("critical"), priority: 100, registrationOrder: 9 }
    ]);
    expect(resolved.map(({ instanceId }) => instanceId)).toEqual(["critical"]);
  });

  it("supports monotonic manual time and deterministic frame cancellation", () => {
    const clock = new ManualAnimationClock(10);
    const scheduler = new ManualFrameScheduler(clock);
    const callback = vi.fn();
    const cancelled = scheduler.request(callback);
    scheduler.cancel(cancelled);
    scheduler.request(callback);
    expect(scheduler.flushFrame(20)).toBe(1);
    expect(callback).toHaveBeenCalledWith(30);
    expect(scheduler.pendingCount).toBe(0);
    expect(() => clock.advanceBy(-1)).toThrow();
  });

  it("provides deterministic disposable preference and visibility subscriptions", () => {
    const motion = new TestMotionPreferenceSource();
    const visibility = new TestVisibilityProvider();
    const motionListener = vi.fn();
    const visibilityListener = vi.fn();
    const unsubscribeMotion = motion.subscribe(motionListener);
    const unsubscribeVisibility = visibility.subscribe("pump", visibilityListener);
    motion.set("reduce");
    visibility.set("pump", "offscreen");
    unsubscribeMotion();
    unsubscribeMotion();
    unsubscribeVisibility();
    motion.set("no-preference");
    visibility.set("pump", "visible");
    expect(motionListener).toHaveBeenCalledTimes(1);
    expect(visibilityListener).toHaveBeenCalledTimes(1);
  });

  it("round-trips definitions without runtime state", () => {
    const definition = createTestAnimationDefinition({
      trigger: { kind: "runtime-boolean", bindingId: "running", expected: true }
    });
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expect(JSON.stringify(definition)).not.toMatch(/progress|frameNumber|instanceId/);
  });
});
