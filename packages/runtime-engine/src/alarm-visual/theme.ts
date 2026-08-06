import type { AlarmSeverity } from "../alarm/types.js";
import type { AlarmTheme, AlarmThemeToken } from "./types.js";

export const DEFAULT_ALARM_THEME: AlarmTheme = Object.freeze({ id: "default" });
export function alarmThemeToken(
  theme: AlarmTheme,
  severity: AlarmSeverity,
  role: string
): AlarmThemeToken {
  const semantic = `alarm.${severity}.${role}`;
  return theme.tokens?.[semantic] ?? semantic;
}
