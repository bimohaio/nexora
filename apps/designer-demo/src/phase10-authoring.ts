import type { JsonValue, ScadaNode } from "@web-scada/core";

export type AnimationPreset = "none" | "rotate" | "pulse" | "blink" | "flow";
export type AlarmPreviewSeverity = "normal" | "warning" | "critical";

export interface Phase10AuthoringState {
  readonly animationPreset: AnimationPreset;
  readonly alarmSeverity: AlarmPreviewSeverity;
  readonly reducedMotion: boolean;
  readonly visibilityOptimization: boolean;
}

const ANIMATION_PRESETS = new Set<AnimationPreset>(["none", "rotate", "pulse", "blink", "flow"]);
const ALARM_SEVERITIES = new Set<AlarmPreviewSeverity>(["normal", "warning", "critical"]);

export const DEFAULT_PHASE10_AUTHORING_STATE: Phase10AuthoringState = Object.freeze({
  animationPreset: "none",
  alarmSeverity: "normal",
  reducedMotion: false,
  visibilityOptimization: true
});

export function readPhase10AuthoringState(node: ScadaNode): Phase10AuthoringState {
  const animation = node.properties.phase10AnimationPreset;
  const alarm = node.properties.phase10AlarmSeverity;
  return Object.freeze({
    animationPreset:
      typeof animation === "string" && ANIMATION_PRESETS.has(animation as AnimationPreset)
        ? (animation as AnimationPreset)
        : "none",
    alarmSeverity:
      typeof alarm === "string" && ALARM_SEVERITIES.has(alarm as AlarmPreviewSeverity)
        ? (alarm as AlarmPreviewSeverity)
        : "normal",
    reducedMotion: node.properties.phase10ReducedMotion === true,
    visibilityOptimization: node.properties.phase10VisibilityOptimization !== false
  });
}

export function writePhase10AuthoringState(
  properties: Readonly<Record<string, JsonValue>>,
  state: Phase10AuthoringState
): Readonly<Record<string, JsonValue>> {
  return Object.freeze({
    ...properties,
    phase10AnimationPreset: state.animationPreset,
    phase10AlarmSeverity: state.alarmSeverity,
    phase10ReducedMotion: state.reducedMotion,
    phase10VisibilityOptimization: state.visibilityOptimization
  });
}

export function describePhase10Preview(state: Phase10AuthoringState): string {
  const motion = state.reducedMotion
    ? state.animationPreset === "none"
      ? "static"
      : "static semantic fallback"
    : state.animationPreset;
  return `${state.alarmSeverity} alarm · ${motion} animation · visibility ${
    state.visibilityOptimization ? "optimized" : "always active"
  }`;
}
