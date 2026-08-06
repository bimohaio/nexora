import type { AlarmSeverityDefinition } from "./types.js";

const DEFAULTS: AlarmSeverityDefinition[] = [
  {
    id: "none",
    priority: 0,
    displayName: "None",
    colorToken: "alarm.none",
    blink: false,
    flash: false,
    overlay: "none",
    soundCapable: false
  },
  {
    id: "info",
    priority: 10,
    displayName: "Info",
    colorToken: "alarm.info",
    blink: false,
    flash: false,
    overlay: "badge",
    soundCapable: false
  },
  {
    id: "low",
    priority: 20,
    displayName: "Low",
    colorToken: "alarm.low",
    blink: false,
    flash: false,
    overlay: "badge",
    soundCapable: true
  },
  {
    id: "medium",
    priority: 30,
    displayName: "Medium",
    colorToken: "alarm.medium",
    blink: true,
    flash: false,
    overlay: "border",
    soundCapable: true
  },
  {
    id: "high",
    priority: 40,
    displayName: "High",
    colorToken: "alarm.high",
    blink: true,
    flash: false,
    overlay: "border",
    soundCapable: true
  },
  {
    id: "critical",
    priority: 50,
    displayName: "Critical",
    colorToken: "alarm.critical",
    blink: true,
    flash: true,
    overlay: "icon",
    soundCapable: true
  },
  {
    id: "emergency",
    priority: 60,
    displayName: "Emergency",
    colorToken: "alarm.emergency",
    blink: true,
    flash: true,
    overlay: "pattern",
    soundCapable: true
  }
];
export const DEFAULT_ALARM_SEVERITIES: readonly AlarmSeverityDefinition[] = Object.freeze(
  DEFAULTS.map((definition) => Object.freeze(definition))
);

export const NON_EFFECTIVE_ALARM_STATUSES = new Set([
  "Normal",
  "Disabled",
  "Shelved",
  "Suppressed",
  "OutOfService",
  "Maintenance"
]);
