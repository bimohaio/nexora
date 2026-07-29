import type { MotionPreference } from "@web-scada/animation-engine";
import type {
  AlarmAccessibilityState,
  AlarmState,
  AlarmVisualRule,
  AlarmVisualState,
  ResolvedPhase10VisualState
} from "./contracts.js";

export interface ResolveAlarmVisualOptions {
  readonly entityId: string;
  readonly state: AlarmState;
  readonly rule: AlarmVisualRule;
  readonly motionPreference: MotionPreference;
}

export function resolveAlarmVisualState(
  options: ResolveAlarmVisualOptions
): ResolvedPhase10VisualState {
  const { entityId, state, rule, motionPreference } = options;
  const acknowledged = state.acknowledgment === "acknowledged";
  const shelved = state.shelving !== "not-shelved";
  const reduced = motionPreference === "reduce";
  const fallback = reduced ? rule.reducedMotionFallback : undefined;
  const visual: AlarmVisualState = {
    alarmId: state.alarmId,
    active: state.active,
    severity: state.severity,
    acknowledged,
    shelved,
    ...((acknowledged && rule.acknowledgedStyle === "deemphasize"
      ? "subtle"
      : (fallback?.emphasis ?? rule.emphasis)) === undefined
      ? {}
      : {
          emphasis:
            acknowledged && rule.acknowledgedStyle === "deemphasize"
              ? ("subtle" as const)
              : (fallback?.emphasis ?? rule.emphasis)
        }),
    ...((fallback?.indicator ?? rule.indicator) === undefined
      ? {}
      : { indicator: fallback?.indicator ?? rule.indicator }),
    ...((fallback?.overlay ?? rule.overlay) === undefined
      ? {}
      : { overlay: fallback?.overlay ?? rule.overlay }),
    ...(rule.colorToken === undefined ? {} : { colorToken: rule.colorToken }),
    ...(rule.borderToken === undefined ? {} : { borderToken: rule.borderToken }),
    ...(rule.iconToken === undefined ? {} : { iconToken: rule.iconToken }),
    ...(reduced || rule.animation === undefined
      ? {}
      : { animationDefinitionId: rule.animation.definitionId }),
    ...(state.message === undefined ? {} : { message: state.message }),
    ...(state.activatedAt === undefined ? {} : { timestamp: state.activatedAt })
  };
  const severity = String(state.severity);
  const accessibility: AlarmAccessibilityState = {
    label: `${severity} alarm${state.message === undefined ? "" : `: ${state.message}`}`,
    description: `${acknowledged ? "Acknowledged" : "Unacknowledged"}${shelved ? ", shelved" : ""}`,
    liveRegionPriority: severity === "critical" && state.active ? "assertive" : "polite"
  };
  return Object.freeze({
    entityId,
    revision: state.revision,
    alarm: Object.freeze(visual),
    accessibility: Object.freeze(accessibility)
  });
}
