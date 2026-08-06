import { DEFAULT_ALARM_SEVERITIES, NON_EFFECTIVE_ALARM_STATUSES } from "./constants.js";
import type { AlarmSeverity, AlarmSeverityDefinition, RuntimeAlarm } from "./types.js";

export class AlarmSeverityRegistry {
  readonly #definitions: ReadonlyMap<AlarmSeverity, AlarmSeverityDefinition>;
  public constructor(definitions: readonly AlarmSeverityDefinition[] = DEFAULT_ALARM_SEVERITIES) {
    const map = new Map<AlarmSeverity, AlarmSeverityDefinition>();
    for (const definition of definitions) {
      if (
        !definition.id.trim() ||
        !definition.displayName.trim() ||
        !definition.colorToken.trim() ||
        !Number.isFinite(definition.priority)
      )
        throw new TypeError("Invalid alarm severity definition.");
      if (map.has(definition.id)) throw new TypeError(`Duplicate alarm severity: ${definition.id}`);
      map.set(definition.id, Object.freeze({ ...definition }));
    }
    if (!map.has("none"))
      throw new TypeError("Alarm severity registry requires the 'none' severity.");
    this.#definitions = map;
    Object.freeze(this);
  }
  public get(id: AlarmSeverity): AlarmSeverityDefinition | undefined {
    return this.#definitions.get(id);
  }
  public priority(id: AlarmSeverity): number {
    return this.get(id)?.priority ?? Number.NEGATIVE_INFINITY;
  }
  public list(): readonly AlarmSeverityDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort(
        (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
      )
    );
  }
}

const STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  Active: 9,
  Offline: 8,
  Unknown: 7,
  Acknowledged: 6,
  Normal: 0,
  Shelved: -1,
  Suppressed: -2,
  Maintenance: -3,
  OutOfService: -4,
  Disabled: -5
});

export function compareAlarmPriority(
  left: RuntimeAlarm,
  right: RuntimeAlarm,
  registry = new AlarmSeverityRegistry()
): number {
  return (
    (NON_EFFECTIVE_ALARM_STATUSES.has(left.status) ? 1 : 0) -
      (NON_EFFECTIVE_ALARM_STATUSES.has(right.status) ? 1 : 0) ||
    right.priority - left.priority ||
    registry.priority(right.severity) - registry.priority(left.severity) ||
    (STATUS_RANK[right.status] ?? 0) - (STATUS_RANK[left.status] ?? 0) ||
    Number(left.acknowledged) - Number(right.acknowledged) ||
    right.sourcePriority - left.sourcePriority ||
    right.timestamp - left.timestamp ||
    left.alarmId.localeCompare(right.alarmId)
  );
}

export function resolveAlarm(
  alarms: readonly RuntimeAlarm[],
  registry = new AlarmSeverityRegistry()
): RuntimeAlarm | undefined {
  return [...alarms]
    .filter(
      (alarm) => !NON_EFFECTIVE_ALARM_STATUSES.has(alarm.status) && alarm.lifecycle !== "NORMAL"
    )
    .sort((a, b) => compareAlarmPriority(a, b, registry))[0];
}
export function resolveSeverity(
  alarms: readonly RuntimeAlarm[],
  registry = new AlarmSeverityRegistry()
): AlarmSeverity {
  return resolveAlarm(alarms, registry)?.severity ?? "none";
}
export function resolveEffectivePriority(
  alarms: readonly RuntimeAlarm[],
  registry = new AlarmSeverityRegistry()
): number {
  const alarm = resolveAlarm(alarms, registry);
  return alarm === undefined ? 0 : Math.max(alarm.priority, registry.priority(alarm.severity));
}
