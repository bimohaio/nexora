import type { AlarmState } from "./contracts.js";
import { asAlarmId, asAlarmSeverityId } from "./severity.js";

export function createTestAlarmState(overrides: Partial<AlarmState> = {}): AlarmState {
  return {
    alarmId: asAlarmId("test-alarm"),
    lifecycle: "active",
    severity: asAlarmSeverityId("alarm"),
    active: true,
    acknowledgment: "unacknowledged",
    shelving: "not-shelved",
    activatedAt: 100,
    message: "Test alarm",
    revision: 1,
    ...overrides
  };
}
