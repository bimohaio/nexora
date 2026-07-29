import { describe, expect, it, vi } from "vitest";
import {
  AnimationComposite,
  AnimationEventDispatcher,
  AnimationPrimitiveFactory,
  AnimationPrimitiveRegistry,
  InterpolationRegistry,
  ManualAnimationClock,
  ObjectPool,
  asPrimitiveId
} from "./index.js";
import type {
  AnimationEvent,
  AnimationPrimitive,
  DefaultPrimitiveAnimationInstance,
  PrimitiveConfiguration,
  PrimitiveDiagnostic,
  PrimitiveInstanceId
} from "./index.js";

const id = asPrimitiveId("animation.test-number");
class TestNumberPrimitive implements AnimationPrimitive<number> {
  public readonly id = id;
  public validate(
    _configuration: Readonly<PrimitiveConfiguration<number>>
  ): readonly PrimitiveDiagnostic[] {
    return [];
  }
  public evaluate(context: {
    readonly configuration: PrimitiveConfiguration<number>;
    readonly directedProgress: number;
  }): number {
    return (
      context.configuration.from +
      (context.configuration.to - context.configuration.from) * context.directedProgress
    );
  }
}

function createFactory(): AnimationPrimitiveFactory {
  const registry = new AnimationPrimitiveRegistry();
  registry.register<number>({
    metadata: {
      id,
      displayName: "Test",
      description: "Test number primitive.",
      version: "1",
      engineCompatibility: "*",
      supportedDirections: ["normal"],
      supportedFillModes: ["both"],
      supportedInterpolations: ["linear"]
    },
    factory: () => new TestNumberPrimitive()
  });
  return new AnimationPrimitiveFactory(registry, new InterpolationRegistry());
}

function createInstance(
  name: string,
  durationMs: number,
  clock: ManualAnimationClock
): DefaultPrimitiveAnimationInstance<number> {
  return createFactory().create({
    id: name as PrimitiveInstanceId,
    primitiveId: id,
    configuration: {
      timing: { durationMs, fillMode: "both" },
      from: 0,
      to: 1
    },
    context: { clock }
  });
}

function event(
  idValue: string,
  priority: AnimationEvent["priority"] = "normal"
): AnimationEvent<{ readonly value: number }> {
  return {
    id: idValue,
    timestamp: 1,
    animationId: "animation",
    instanceId: "instance",
    category: "lifecycle",
    version: 1,
    correlationId: "correlation",
    priority,
    payload: { value: 1 }
  };
}

describe("animation event dispatcher", () => {
  it("filters, orders queued priorities, handles reentrancy and isolates subscribers", () => {
    const dispatcher = new AnimationEventDispatcher();
    const received: string[] = [];
    dispatcher.subscribe({ categories: ["lifecycle"] }, (entry) => {
      received.push(`first:${entry.id}`);
      if (entry.id === "outer") dispatcher.publish(event("nested"));
    });
    dispatcher.subscribe({ ids: ["outer"] }, () => {
      throw new Error("isolated");
    });
    dispatcher.publish(event("low", "low"), true);
    dispatcher.publish(event("critical", "critical"), true);
    expect(dispatcher.flush()).toBe(2);
    dispatcher.publish(event("outer"));
    expect(received).toEqual(["first:critical", "first:low", "first:outer", "first:nested"]);
    expect(dispatcher.snapshot()).toMatchObject({
      publishedEvents: 4,
      deliveredEvents: 4,
      subscriberFailures: 1
    });
  });

  it("unsubscribes idempotently and rejects use after disposal", () => {
    const dispatcher = new AnimationEventDispatcher();
    const listener = vi.fn();
    const subscription = dispatcher.subscribe({}, listener);
    subscription.unsubscribe();
    subscription.unsubscribe();
    dispatcher.publish(event("ignored"));
    expect(listener).not.toHaveBeenCalled();
    dispatcher.dispose();
    dispatcher.dispose();
    expect(() => {
      dispatcher.publish(event("disposed"));
    }).toThrow(/disposed/);
  });
});

describe("animation object pool", () => {
  it("resets, reuses, tracks ownership and rejects double release", () => {
    const pool = new ObjectPool(
      () => ({ value: 0, callback: undefined as (() => void) | undefined }),
      (entry) => {
        entry.value = 0;
        entry.callback = undefined;
      },
      2
    );
    const value = pool.acquire();
    value.value = 10;
    value.callback = () => undefined;
    pool.release(value);
    expect(value).toEqual({ value: 0, callback: undefined });
    expect(() => {
      pool.release(value);
    }).toThrow(/already released/);
    expect(pool.acquire()).toBe(value);
    expect(pool.snapshot()).toMatchObject({
      created: 1,
      acquired: 2,
      released: 1,
      reused: 1,
      peakActive: 1
    });
    expect(() => {
      pool.release({ value: 0, callback: undefined });
    }).toThrow(/another pool/);
  });
});

describe("animation composites", () => {
  it("coordinates parallel children and completes deterministically", () => {
    const clock = new ManualAnimationClock();
    const composite = new AnimationComposite({
      id: "parallel",
      type: "parallel",
      children: [
        { id: "a", instance: createInstance("a", 100, clock) },
        { id: "b", instance: createInstance("b", 200, clock) }
      ]
    });
    composite.play(0);
    clock.set(100);
    expect(composite.update(100)).toMatchObject({
      state: "running",
      completedChildIds: ["a"],
      activeChildIds: ["b"]
    });
    clock.set(200);
    expect(composite.update(200)).toMatchObject({
      state: "completed",
      completedChildIds: ["a", "b"]
    });
    composite.dispose();
    expect(() => composite.update(300)).toThrow(/disposed/);
  });

  it("coordinates sequence, stagger, race and cancellation without scheduling frames", () => {
    const sequenceClock = new ManualAnimationClock();
    const sequence = new AnimationComposite({
      id: "sequence",
      type: "sequence",
      children: [
        { id: "a", instance: createInstance("sa", 10, sequenceClock) },
        { id: "b", instance: createInstance("sb", 10, sequenceClock) }
      ]
    });
    sequence.play(0);
    sequenceClock.set(10);
    expect(sequence.update(10).activeChildIds).toEqual(["b"]);
    sequenceClock.set(20);
    expect(sequence.update(20).state).toBe("completed");

    const staggerClock = new ManualAnimationClock();
    const stagger = new AnimationComposite({
      id: "stagger",
      type: "stagger",
      staggerMs: 10,
      children: [
        { id: "a", instance: createInstance("ta", 100, staggerClock) },
        { id: "b", instance: createInstance("tb", 100, staggerClock) }
      ]
    });
    stagger.play(0);
    expect(stagger.snapshot().activeChildIds).toEqual(["a"]);
    staggerClock.set(10);
    expect(stagger.update(10).activeChildIds).toEqual(["a", "b"]);
    stagger.cancel();
    stagger.cancel();
    expect(stagger.snapshot().state).toBe("cancelled");

    const raceClock = new ManualAnimationClock();
    const race = new AnimationComposite({
      id: "race",
      type: "race",
      children: [
        { id: "fast", instance: createInstance("fast", 10, raceClock) },
        { id: "slow", instance: createInstance("slow", 100, raceClock) }
      ]
    });
    race.play(0);
    raceClock.set(10);
    expect(race.update(10).state).toBe("completed");
  });
});
