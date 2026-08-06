import { describe, expect, it } from "vitest";
import {
  AnimationPrimitiveFactory,
  BUILT_IN_PRIMITIVE_IDS,
  InterpolationRegistry,
  ManualAnimationClock,
  createBuiltInAnimationPrimitiveRegistry,
  type PrimitiveInstanceId
} from "./index.js";

describe("built-in animation primitive catalog", () => {
  it("registers every Phase 10.02 primitive mapping", () => {
    const registry = createBuiltInAnimationPrimitiveRegistry();
    expect(registry.list().map(({ id }) => id)).toEqual(
      Object.values(BUILT_IN_PRIMITIVE_IDS).sort()
    );
  });

  it("creates deterministic scalar and color instances through the production factory", () => {
    const clock = new ManualAnimationClock();
    const factory = new AnimationPrimitiveFactory(
      createBuiltInAnimationPrimitiveRegistry(),
      new InterpolationRegistry()
    );
    const scalar = factory.create<number>({
      id: "scalar" as PrimitiveInstanceId,
      primitiveId: BUILT_IN_PRIMITIVE_IDS.scalar,
      configuration: { timing: { durationMs: 100 }, from: 0, to: 10 },
      context: { clock }
    });
    scalar.play();
    clock.set(50);
    expect(scalar.update(50).value).toBe(5);

    const color = factory.create({
      id: "color" as PrimitiveInstanceId,
      primitiveId: BUILT_IN_PRIMITIVE_IDS.color,
      configuration: {
        timing: { durationMs: 100 },
        from: { r: 0, g: 0, b: 0, a: 0 },
        to: { r: 255, g: 128, b: 0, a: 1 }
      },
      context: { clock }
    });
    color.play();
    clock.set(100);
    expect(color.update(100).value).toEqual({ r: 128, g: 64, b: 0, a: 0.5 });
  });
});
