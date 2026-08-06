import { AlarmSeverityRegistry, resolveAlarm } from "./severity-resolver.js";
import type {
  AlarmAggregate,
  AlarmScopeKind,
  AlarmVisualState,
  ResolvedAlarm,
  RuntimeAlarm
} from "./types.js";

export function resolveVisualAlarm(
  alarm: RuntimeAlarm | undefined,
  registry = new AlarmSeverityRegistry()
): AlarmVisualState {
  const definition = alarm === undefined ? registry.get("none") : registry.get(alarm.severity);
  const suppressed = alarm === undefined;
  return Object.freeze({
    blink: !suppressed && (definition?.blink ?? false),
    flash: !suppressed && (definition?.flash ?? false),
    badge: !suppressed,
    overlay: suppressed ? "none" : (definition?.overlay ?? "badge"),
    borderEmphasis: !suppressed && (definition?.priority ?? 0) >= 30,
    ...(suppressed ? {} : { icon: `alarm-${alarm.severity}` }),
    priorityToken: definition?.colorToken ?? "alarm.none"
  });
}

export function aggregateAlarms(
  alarms: readonly RuntimeAlarm[],
  registry = new AlarmSeverityRegistry()
): ResolvedAlarm {
  const effectiveAlarm = resolveAlarm(alarms, registry);
  return Object.freeze({
    ...(effectiveAlarm === undefined ? {} : { effectiveAlarm }),
    effectiveSeverity: effectiveAlarm?.severity ?? "none",
    effectiveStatus: effectiveAlarm?.status ?? "Normal",
    alarmCount: alarms.filter((alarm) => alarm.lifecycle !== "NORMAL").length,
    ackRequired: alarms.some(
      (alarm) =>
        alarm.requiresAcknowledgement && !alarm.acknowledged && alarm.lifecycle !== "NORMAL"
    ),
    visual: resolveVisualAlarm(effectiveAlarm, registry)
  });
}

export function createAlarmAggregate(
  scope: AlarmScopeKind,
  scopeId: string,
  alarms: readonly RuntimeAlarm[],
  registry = new AlarmSeverityRegistry()
): AlarmAggregate {
  const resolved = aggregateAlarms(alarms, registry);
  return Object.freeze({
    scope,
    scopeId,
    ...resolved,
    alarmIds: Object.freeze(alarms.map(({ alarmId }) => alarmId).sort())
  });
}
