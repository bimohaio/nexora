import { describe, expect, it, vi } from "vitest";
import {
  AnimationPrimitiveFactory,
  AnimationPrimitiveRegistry,
  InterpolationRegistry,
  ManualAnimationClock,
  ManualAnimationFrameDriver,
  PrimitiveSchedulerAdapter,
  SharedAnimationScheduler,
  asPrimitiveId
} from "./index.js";
import type {
  AnimationPrimitive,
  PrimitiveConfiguration,
  PrimitiveDiagnostic,
  PrimitiveInstanceId,
  PrimitiveMetadata
} from "./index.js";

const primitiveId = asPrimitiveId("animation.number");
const aliasId = asPrimitiveId("animation.legacy-number");
const metadata: PrimitiveMetadata = {
  id: primitiveId,
  displayName: "Number",
  description: "Interpolates a renderer-neutral number.",
  version: "1.0.0",
  engineCompatibility: ">=0.0.0",
  aliases: [aliasId],
  supportedDirections: ["normal", "reverse", "alternate", "alternate-reverse"],
  supportedFillModes: ["none", "forwards", "backwards", "both"],
  supportedInterpolations: ["linear", "ease-in"]
};

class NumberPrimitive implements AnimationPrimitive<number> {
  public readonly id = primitiveId;
  public validate(
    configuration: Readonly<PrimitiveConfiguration<number>>
  ): readonly PrimitiveDiagnostic[] {
    return Number.isFinite(configuration.from) && Number.isFinite(configuration.to)
      ? []
      : [
          {
            code: "INVALID_VALUE",
            severity: "error",
            message: "Endpoints must be finite.",
            recoverable: false,
            context: {}
          }
        ];
  }
  public evaluate(context: {
    readonly configuration: Readonly<PrimitiveConfiguration<number>>;
    readonly directedProgress: number;
  }): number {
    return (
      context.configuration.from +
      (context.configuration.to - context.configuration.from) * context.directedProgress
    );
  }
}

const createRegistry = (): AnimationPrimitiveRegistry => {
  const registry = new AnimationPrimitiveRegistry();
  registry.register({ metadata, factory: () => new NumberPrimitive() });
  return registry;
};

describe("animation primitive registry and factory", () => {
  it("registers, resolves aliases, exposes immutable metadata and unregisters", () => {
    const registry = createRegistry();
    expect(registry.has(aliasId)).toBe(true);
    expect(registry.resolve<number>(aliasId).metadata.id).toBe(primitiveId);
    expect(registry.snapshot()).toMatchObject({
      deprecatedRequests: 1,
      unknownRequests: 0,
      duplicateAttempts: 0
    });
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.list()[0]?.supportedDirections)).toBe(true);
    expect(registry.unregister(aliasId)).toBe(true);
    expect(registry.has(primitiveId)).toBe(false);
  });

  it("rejects duplicate and unknown registrations with typed diagnostics", () => {
    const registry = createRegistry();
    expect(() => {
      registry.register({ metadata, factory: () => new NumberPrimitive() });
    }).toThrow(/already registered/);
    expect(() => registry.resolve(asPrimitiveId("animation.missing"))).toThrow(/not registered/);
    expect(registry.snapshot()).toMatchObject({ duplicateAttempts: 1, unknownRequests: 1 });
  });

  it("constructs independent created instances atomically", () => {
    const clock = new ManualAnimationClock();
    const factory = new AnimationPrimitiveFactory(createRegistry(), new InterpolationRegistry());
    const request = {
      primitiveId,
      configuration: {
        timing: { durationMs: 100, fillMode: "both" as const },
        from: 0,
        to: 10
      },
      context: { clock }
    };
    const first = factory.create({
      ...request,
      id: "first" as PrimitiveInstanceId
    });
    const second = factory.create({
      ...request,
      id: "second" as PrimitiveInstanceId
    });
    expect(first.snapshot().state).toBe("created");
    expect(second.snapshot().state).toBe("created");
    first.play();
    clock.set(50);
    expect(first.update(50).value).toBe(5);
    expect(second.snapshot().progress).toBe(0);
    expect(request.configuration).toEqual({
      timing: { durationMs: 100, fillMode: "both" },
      from: 0,
      to: 10
    });
  });

  it("rejects invalid construction before an instance escapes", () => {
    const factory = new AnimationPrimitiveFactory(createRegistry(), new InterpolationRegistry());
    expect(() =>
      factory.create({
        id: "invalid" as PrimitiveInstanceId,
        primitiveId,
        configuration: { timing: { durationMs: 1 }, from: Number.NaN, to: 1 },
        context: { clock: new ManualAnimationClock() }
      })
    ).toThrow(/finite/);
    expect(() =>
      factory.create({
        id: "unsupported" as PrimitiveInstanceId,
        primitiveId,
        configuration: {
          timing: { durationMs: 1 },
          from: 0,
          to: 1,
          interpolation: "discrete"
        },
        context: { clock: new ManualAnimationClock() }
      })
    ).toThrow(/does not support/);
  });
});

describe("primitive instance lifecycle and scheduler integration", () => {
  it("enforces lifecycle, isolates callbacks, and releases callbacks on disposal", () => {
    const clock = new ManualAnimationClock();
    const diagnostics: PrimitiveDiagnostic[] = [];
    const onStart = vi.fn(() => {
      throw new Error("subscriber");
    });
    const onDispose = vi.fn();
    const instance = new AnimationPrimitiveFactory(
      createRegistry(),
      new InterpolationRegistry()
    ).create({
      id: "lifecycle" as PrimitiveInstanceId,
      primitiveId,
      configuration: {
        timing: { durationMs: 100, fillMode: "forwards" },
        from: 0,
        to: 1
      },
      context: { clock, reportDiagnostic: (entry) => diagnostics.push(entry) },
      callbacks: { onStart, onDispose }
    });
    expect(() => {
      instance.pause();
    }).toThrow(/Cannot pause/);
    instance.play();
    instance.play();
    instance.pause();
    instance.pause();
    instance.resume();
    clock.set(100);
    expect(instance.update(100)).toMatchObject({ value: 1, complete: true });
    expect(() => {
      instance.resume();
    }).toThrow(/Cannot resume/);
    expect(diagnostics[0]?.code).toBe("ANIMATION_CALLBACK_FAILED");
    instance.reset();
    expect(instance.snapshot().state).toBe("created");
    instance.setPlaybackRate(2);
    instance.play();
    instance.dispose();
    instance.dispose();
    expect(onDispose).toHaveBeenCalledOnce();
    expect(() => {
      instance.play();
    }).toThrow(/disposed/);
  });

  it("uses exactly one shared scheduler task and emits neutral invalidation", () => {
    const clock = new ManualAnimationClock();
    const driver = new ManualAnimationFrameDriver();
    const commits: unknown[] = [];
    const scheduler = new SharedAnimationScheduler({
      timeSource: clock,
      frameDriver: driver,
      invalidationSink: { commit: (batch) => commits.push(batch) }
    });
    const instance = new AnimationPrimitiveFactory(
      createRegistry(),
      new InterpolationRegistry()
    ).create({
      id: "scheduled" as PrimitiveInstanceId,
      primitiveId,
      configuration: {
        timing: { durationMs: 100, fillMode: "both" },
        from: 0,
        to: 1
      },
      context: { clock }
    });
    const values: (number | undefined)[] = [];
    const adapter = new PrimitiveSchedulerAdapter<number>(scheduler);
    const handle = adapter.attach({
      instance,
      onResult: (value) => values.push(value),
      invalidation: { targetType: "animation-target", targetId: "pump", reason: "opacity" }
    });
    expect(adapter.attach({ instance }).id).toBe(handle.id);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(1);
    clock.set(0);
    driver.fireFrame(0);
    clock.set(50);
    driver.fireFrame(50);
    clock.set(100);
    driver.fireFrame(100);
    expect(values).toEqual([0, 0.5, 1]);
    expect(commits).toHaveLength(3);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(0);
    expect(instance.snapshot().state).toBe("disposed");
    adapter.dispose();
    expect(scheduler.state).toBe("running");
    scheduler.dispose();
  });
});
