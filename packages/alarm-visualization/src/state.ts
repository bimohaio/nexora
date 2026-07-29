import type { AlarmAcknowledgmentState, AlarmLifecycleState, AlarmState } from "./contracts.js";

const LIFECYCLE_TRANSITIONS: Readonly<Record<AlarmLifecycleState, readonly AlarmLifecycleState[]>> =
  {
    inactive: ["active", "disabled"],
    active: ["returned-to-normal", "disabled"],
    "returned-to-normal": ["inactive", "active", "disabled"],
    disabled: ["inactive"]
  };
const ACK_TRANSITIONS: Readonly<
  Record<AlarmAcknowledgmentState, readonly AlarmAcknowledgmentState[]>
> = {
  "not-required": [],
  unacknowledged: ["acknowledged"],
  acknowledged: ["unacknowledged"]
};

export function canTransitionAlarmLifecycle(
  from: AlarmLifecycleState,
  to: AlarmLifecycleState
): boolean {
  return from === to || LIFECYCLE_TRANSITIONS[from].includes(to);
}
export function canTransitionAcknowledgment(
  from: AlarmAcknowledgmentState,
  to: AlarmAcknowledgmentState
): boolean {
  return from === to || ACK_TRANSITIONS[from].includes(to);
}

export function acknowledgeAlarm(state: AlarmState, acknowledgedAt: number): AlarmState {
  if (
    state.acknowledgment !== "unacknowledged" ||
    !Number.isFinite(acknowledgedAt) ||
    acknowledgedAt < (state.activatedAt ?? 0)
  )
    return state;
  return Object.freeze({
    ...state,
    acknowledgment: "acknowledged",
    acknowledgedAt,
    revision: state.revision + 1
  });
}
