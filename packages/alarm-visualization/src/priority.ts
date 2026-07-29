import type {
  AlarmPriorityResolver,
  AlarmSeverityRegistry,
  AlarmState,
  ResolvedEntityAlarmState
} from "./contracts.js";

const LIFECYCLE_RANK = {
  active: 4,
  "returned-to-normal": 3,
  inactive: 2,
  disabled: 1
} as const;
const ACK_RANK = { unacknowledged: 3, acknowledged: 2, "not-required": 1 } as const;
const SHELVING_RANK = { "not-shelved": 3, "shelved-until": 2, shelved: 1 } as const;

export class DefaultAlarmPriorityResolver implements AlarmPriorityResolver {
  public constructor(private readonly severities: AlarmSeverityRegistry) {}

  public resolve(alarms: readonly AlarmState[]): ResolvedEntityAlarmState {
    const sorted = [...alarms].sort(
      (left, right) =>
        LIFECYCLE_RANK[right.lifecycle] - LIFECYCLE_RANK[left.lifecycle] ||
        (this.severities.rank(right.severity) ?? -1) -
          (this.severities.rank(left.severity) ?? -1) ||
        ACK_RANK[right.acknowledgment] - ACK_RANK[left.acknowledgment] ||
        SHELVING_RANK[right.shelving] - SHELVING_RANK[left.shelving] ||
        (right.activatedAt ?? -1) - (left.activatedAt ?? -1) ||
        left.alarmId.localeCompare(right.alarmId)
    );
    const frozen = Object.freeze(sorted);
    return sorted[0] === undefined ? { alarms: frozen } : { primary: sorted[0], alarms: frozen };
  }
}
