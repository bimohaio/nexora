import { describe, expect, it } from "vitest";
import { toSymbolAnimationBindingInput } from "./symbol-animation-bindings.js";

describe("symbol animation binding adapter", () => {
  it("maps slot-scoped and legacy direct runtime outputs", () => {
    expect(
      toSymbolAnimationBindingInput({
        entityId: "pump-1",
        target: "animation.motion.speed",
        value: 2,
        quality: "good"
      })
    ).toEqual({
      input: { entityId: "pump-1", slotId: "motion", parameter: "speed", value: 2 },
      diagnostics: []
    });
    expect(
      toSymbolAnimationBindingInput({
        entityId: "tank-1",
        target: "level",
        value: 0.75,
        quality: "uncertain"
      }).input
    ).toEqual({ entityId: "tank-1", parameter: "level", value: 0.75 });
  });

  it("isolates invalid targets and bad quality", () => {
    expect(
      toSymbolAnimationBindingInput({
        entityId: "pump-1",
        target: "animation.motion.unknown",
        value: 1,
        quality: "good"
      }).diagnostics[0]?.code
    ).toBe("ANIMATION_BINDING_TARGET_INVALID");
    expect(
      toSymbolAnimationBindingInput({
        entityId: "pump-1",
        target: "animation.motion.enabled",
        value: true,
        quality: "bad"
      }).diagnostics[0]?.code
    ).toBe("ANIMATION_BINDING_QUALITY_REJECTED");
  });
});
