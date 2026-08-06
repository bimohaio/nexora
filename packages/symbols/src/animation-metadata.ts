import type { JsonValue } from "@web-scada/core";
import type {
  SymbolAnimationMetadata,
  SymbolAnimationPrimitive,
  SymbolAnimationSlotDefinition,
  SymbolAnimationTargetDefinition,
  SymbolDefinition
} from "./symbol.js";

export type BuiltInSymbolAnimationProfile = "motion" | "flow" | "level" | "indicator" | "valve";

export function createBuiltInSymbolAnimationMetadata(
  profiles: readonly BuiltInSymbolAnimationProfile[]
): SymbolAnimationMetadata {
  const targets: SymbolAnimationTargetDefinition[] = [];
  const slots: SymbolAnimationSlotDefinition[] = [];
  const add = (
    profile: BuiltInSymbolAnimationProfile,
    primitive: SymbolAnimationPrimitive,
    property: string,
    from: JsonValue,
    to: JsonValue,
    durationMs: number,
    reducedMotion: SymbolAnimationSlotDefinition["reducedMotion"] = "disable"
  ): void => {
    targets.push({ id: profile, part: "root", property, valueType: "number" });
    slots.push({
      id: profile,
      primitive,
      target: profile,
      channel: property,
      defaults: {
        enabled: false,
        from,
        to,
        durationMs,
        iterations: "infinite",
        direction: "normal"
      },
      priority: 0,
      reducedMotion,
      visibility: "pause-offscreen"
    });
  };
  for (const profile of [...new Set(profiles)]) {
    if (profile === "motion") add(profile, "rotation", "rotation", 0, 360, 1000);
    else if (profile === "flow") add(profile, "scalar", "flowOffset", 0, 24, 900);
    else if (profile === "level") add(profile, "scalar", "level", 0, 1, 1200, "static-final-state");
    else if (profile === "indicator") add(profile, "opacity", "opacity", 0.35, 1, 600);
    else add(profile, "scalar", "openness", 0, 1, 500, "static-final-state");
  }
  return {
    capabilities: [...new Set(profiles)],
    targets,
    slots,
    parameters: [
      { key: "enabled", valueType: "boolean", defaultValue: false },
      { key: "speed", valueType: "number", defaultValue: 1, minimum: 0 },
      { key: "direction", valueType: "string", defaultValue: "normal" },
      { key: "duration", valueType: "number", minimum: 0 },
      { key: "opacity", valueType: "number", minimum: 0, maximum: 1 },
      { key: "color", valueType: "color" },
      { key: "level", valueType: "number", minimum: 0, maximum: 1 },
      { key: "flow", valueType: "number" }
    ]
  };
}

/** Compatibility bridge for Phase 10 declarations created before structured metadata existed. */
export function resolveSymbolAnimationMetadata(
  definition: SymbolDefinition
): SymbolAnimationMetadata | undefined {
  if (definition.animation !== undefined) return definition.animation;
  const legacyTargets = definition.phase10Capabilities?.animationTargets ?? [];
  if (legacyTargets.length === 0) return undefined;
  const profiles = legacyTargets.flatMap((target): BuiltInSymbolAnimationProfile[] => {
    const normalized = target.toLowerCase();
    if (/rotor|shaft|blade|fan|motor|pump|rotation/.test(normalized)) return ["motion"];
    if (/pipe|flow|belt|conveyor/.test(normalized)) return ["flow"];
    if (/level|liquid|fill|tank/.test(normalized)) return ["level"];
    if (/lamp|beacon|indicator|light/.test(normalized)) return ["indicator"];
    if (/valve|gate|disc|open/.test(normalized)) return ["valve"];
    return [];
  });
  return profiles.length === 0 ? undefined : createBuiltInSymbolAnimationMetadata(profiles);
}
