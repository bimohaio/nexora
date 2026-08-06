import type { AlarmInput, AlarmLifecycle, AlarmStatus, RuntimeAlarm } from "./types.js";

const UNSAFE_METADATA_KEYS = new Set(["__proto__", "prototype", "constructor"]);
function freezeJson(value: RuntimeAlarm["metadata"][string]): RuntimeAlarm["metadata"][string] {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  const clone: Record<string, RuntimeAlarm["metadata"][string]> = Object.create(null) as Record<
    string,
    RuntimeAlarm["metadata"][string]
  >;
  const record = value as Readonly<Record<string, RuntimeAlarm["metadata"][string]>>;
  for (const key of Object.keys(record).sort()) {
    if (UNSAFE_METADATA_KEYS.has(key)) throw new TypeError("Unsafe alarm metadata key.");
    clone[key] = freezeJson(record[key] ?? null);
  }
  return Object.freeze(clone);
}

export function resolveAcknowledgement(alarm: RuntimeAlarm, acknowledgedAt: number): RuntimeAlarm {
  if (
    !alarm.requiresAcknowledgement ||
    alarm.acknowledged ||
    alarm.lifecycle === "NORMAL" ||
    !Number.isFinite(acknowledgedAt) ||
    acknowledgedAt < alarm.timestamp
  )
    return alarm;
  const lifecycle: AlarmLifecycle = alarm.lifecycle === "RETURNED_UNACK" ? "NORMAL" : "ACTIVE_ACK";
  return Object.freeze({
    ...alarm,
    lifecycle,
    status: lifecycle === "ACTIVE_ACK" ? "Acknowledged" : "Normal",
    acknowledged: true,
    pendingAcknowledgement: false,
    timestamp: acknowledgedAt,
    revision: alarm.revision + 1
  });
}

export function resolveAlarmLifecycle(
  previous: RuntimeAlarm | undefined,
  input: AlarmInput
): RuntimeAlarm {
  if (previous !== undefined && input.timestamp < previous.timestamp) return previous;
  const active =
    input.status === "Active" ||
    input.status === "Acknowledged" ||
    input.status === "Offline" ||
    input.status === "Unknown";
  let lifecycle: AlarmLifecycle;
  let status: AlarmStatus = input.status;
  let acknowledged = input.acknowledged ?? false;
  if (!active) {
    if (
      previous !== undefined &&
      previous.lifecycle !== "NORMAL" &&
      previous.requiresAcknowledgement &&
      !previous.acknowledged
    )
      lifecycle = "RETURNED_UNACK";
    else lifecycle = "NORMAL";
  } else if (acknowledged) lifecycle = "ACTIVE_ACK";
  else lifecycle = "ACTIVE_UNACK";
  if (lifecycle === "ACTIVE_ACK") status = "Acknowledged";
  if (lifecycle === "NORMAL" && status === "Active") status = "Normal";
  if (!input.requiresAcknowledgement) acknowledged = false;
  return Object.freeze({
    ...input,
    status,
    lifecycle,
    sourcePriority: input.sourcePriority ?? 0,
    priority: input.priority ?? 0,
    quality: input.quality ?? "good",
    requiresAcknowledgement: input.requiresAcknowledgement ?? true,
    acknowledged,
    pendingAcknowledgement:
      input.pendingAcknowledgement ??
      (lifecycle === "ACTIVE_UNACK" || lifecycle === "RETURNED_UNACK"),
    returnedWhileAcknowledged:
      input.returnedWhileAcknowledged ?? (!active && previous?.acknowledged === true),
    metadata: freezeJson(input.metadata ?? {}) as RuntimeAlarm["metadata"],
    revision: (previous?.revision ?? input.revision ?? 0) + 1
  });
}

export function clearAlarm(alarm: RuntimeAlarm, timestamp: number): RuntimeAlarm {
  if (!Number.isFinite(timestamp) || timestamp < alarm.timestamp) return alarm;
  return Object.freeze({
    ...alarm,
    lifecycle: alarm.requiresAcknowledgement && !alarm.acknowledged ? "RETURNED_UNACK" : "NORMAL",
    status: "Normal",
    timestamp,
    pendingAcknowledgement: alarm.requiresAcknowledgement && !alarm.acknowledged,
    returnedWhileAcknowledged: alarm.acknowledged,
    revision: alarm.revision + 1
  });
}
