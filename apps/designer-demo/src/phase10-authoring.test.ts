import type { ScadaNode } from "@web-scada/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE10_AUTHORING_STATE,
  describePhase10Preview,
  readPhase10AuthoringState,
  writePhase10AuthoringState
} from "./phase10-authoring.js";

const node = { properties: {} } as ScadaNode;

describe("Phase 10 authoring state", () => {
  it("round-trips through existing public node properties", () => {
    const properties = writePhase10AuthoringState(node.properties, {
      animationPreset: "rotate",
      alarmSeverity: "critical",
      reducedMotion: true,
      visibilityOptimization: false
    });
    expect(readPhase10AuthoringState({ ...node, properties })).toEqual({
      animationPreset: "rotate",
      alarmSeverity: "critical",
      reducedMotion: true,
      visibilityOptimization: false
    });
    expect(describePhase10Preview(readPhase10AuthoringState({ ...node, properties }))).toContain(
      "static semantic fallback"
    );
  });

  it("uses safe defaults for unknown authoring values", () => {
    expect(
      readPhase10AuthoringState({
        ...node,
        properties: { phase10AnimationPreset: "unknown", phase10AlarmSeverity: 4 }
      })
    ).toEqual(DEFAULT_PHASE10_AUTHORING_STATE);
  });
});
