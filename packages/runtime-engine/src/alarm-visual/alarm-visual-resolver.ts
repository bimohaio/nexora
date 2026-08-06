import type { AlarmAggregate, AlarmSeverity, AlarmStatus } from "../alarm/types.js";
import { DEFAULT_ALARM_THEME, alarmThemeToken } from "./theme.js";
import {
  presentationOverlayFromPolicy,
  type AlarmAnimationPolicy,
  type AlarmBadge,
  type AlarmBorder,
  type AlarmFill,
  type AlarmIcon,
  type AlarmIconKind,
  type AlarmOverlay,
  type AlarmPresentation,
  type AlarmText,
  type ResolvePresentationOptions
} from "./types.js";

const SEVERITY_LEVEL: Readonly<Record<string, number>> = Object.freeze({
  none: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
  emergency: 6
});
function level(severity: AlarmSeverity): number {
  return SEVERITY_LEVEL[severity] ?? 1;
}
function statusSeverity(status: AlarmStatus, severity: AlarmSeverity): AlarmSeverity {
  return status === "Disabled" ? "none" : severity;
}

export function resolveBadge(aggregate: AlarmAggregate, theme = DEFAULT_ALARM_THEME): AlarmBadge {
  const severity = aggregate.effectiveSeverity;
  const kind =
    aggregate.alarmCount > 1
      ? "count"
      : level(severity) >= 6
        ? "octagon"
        : level(severity) >= 5
          ? "diamond"
          : level(severity) >= 3
            ? "triangle"
            : level(severity) > 0
              ? "circle"
              : "none";
  return Object.freeze({
    kind,
    token: alarmThemeToken(theme, severity, "badge"),
    ...(aggregate.alarmCount > 1
      ? { count: aggregate.alarmCount, label: String(aggregate.alarmCount) }
      : {})
  });
}
export function resolveOverlay(
  aggregate: AlarmAggregate,
  theme = DEFAULT_ALARM_THEME
): AlarmOverlay {
  return Object.freeze({
    kind: presentationOverlayFromPolicy(aggregate.visual.overlay),
    token: alarmThemeToken(theme, aggregate.effectiveSeverity, "overlay"),
    ...(aggregate.effectiveSeverity === "none" ? {} : { opacity: 0.32 })
  });
}
export function resolveBorder(aggregate: AlarmAggregate, theme = DEFAULT_ALARM_THEME): AlarmBorder {
  const rank = level(aggregate.effectiveSeverity);
  return Object.freeze({
    kind: rank >= 6 ? "double" : rank >= 4 ? "severity" : rank > 0 ? "solid" : "none",
    token: alarmThemeToken(theme, aggregate.effectiveSeverity, "stroke"),
    thickness: rank >= 5 ? 3 : rank > 0 ? 2 : 0,
    emphasized: rank >= 4
  });
}
export function resolveFill(aggregate: AlarmAggregate, theme = DEFAULT_ALARM_THEME): AlarmFill {
  const severity = aggregate.effectiveSeverity;
  return Object.freeze({
    token: alarmThemeToken(theme, severity, "fill"),
    tintToken: alarmThemeToken(theme, severity, "tint"),
    ...(level(severity) >= 5 ? { patternToken: alarmThemeToken(theme, severity, "pattern") } : {}),
    opacity: severity === "none" ? 1 : 0.9,
    gradientRequest: false,
    textureRequest: level(severity) >= 6
  });
}
function iconKind(aggregate: AlarmAggregate, status: AlarmStatus): AlarmIconKind {
  if (status === "Offline" || status === "Unknown") return "offline";
  if (status === "Maintenance" || status === "OutOfService") return "maintenance";
  if (aggregate.effectiveAlarm?.category === "communication") return "communication";
  if (aggregate.effectiveAlarm?.category === "electrical") return "electrical";
  if (aggregate.effectiveAlarm?.category === "security") return "security";
  if (aggregate.effectiveAlarm?.category === "safety" && level(aggregate.effectiveSeverity) >= 5)
    return "fire";
  if (aggregate.effectiveSeverity === "emergency") return "emergency";
  if (aggregate.effectiveSeverity === "info") return "information";
  if (level(aggregate.effectiveSeverity) >= 3) return "alarm";
  if (level(aggregate.effectiveSeverity) > 0) return "warning";
  return "none";
}
export function resolveIcon(
  aggregate: AlarmAggregate,
  status = aggregate.effectiveStatus,
  theme = DEFAULT_ALARM_THEME
): AlarmIcon {
  const kind = iconKind(aggregate, status);
  return Object.freeze({
    kind,
    token: alarmThemeToken(theme, aggregate.effectiveSeverity, "icon")
  });
}
export function resolveText(
  aggregate: AlarmAggregate,
  reducedMotion = false,
  theme = DEFAULT_ALARM_THEME
): AlarmText {
  const rank = level(aggregate.effectiveSeverity);
  return Object.freeze({
    colorToken: alarmThemeToken(theme, aggregate.effectiveSeverity, "text"),
    weight: rank >= 5 ? "bold" : rank >= 3 ? "medium" : "normal",
    blink: !reducedMotion && aggregate.visual.blink,
    underline: aggregate.ackRequired,
    outline: rank >= 5,
    contrastBoost: reducedMotion || rank >= 4
  });
}
export function resolveAnimation(
  aggregate: AlarmAggregate,
  reducedMotion = false
): AlarmAnimationPolicy {
  const requests = reducedMotion
    ? []
    : [
        ...(aggregate.visual.blink ? ["blink" as const] : []),
        ...(aggregate.visual.flash ? ["flash" as const] : []),
        ...(level(aggregate.effectiveSeverity) >= 4 ? ["pulse" as const] : []),
        ...(level(aggregate.effectiveSeverity) >= 5 ? ["glow" as const] : [])
      ];
  return Object.freeze({
    requests: Object.freeze(requests),
    reducedMotion,
    staticFallback: reducedMotion && aggregate.effectiveSeverity !== "none"
  });
}

export function resolvePresentation(options: ResolvePresentationOptions): AlarmPresentation {
  const theme = options.theme ?? DEFAULT_ALARM_THEME;
  const reduced = options.motionPreference === "reduce";
  const aggregate = options.aggregate;
  const status = options.statusOverride ?? aggregate.effectiveStatus;
  const severity = statusSeverity(status, aggregate.effectiveSeverity);
  const acknowledged = aggregate.effectiveAlarm?.acknowledged ?? false;
  const presentationAggregate =
    severity === aggregate.effectiveSeverity
      ? aggregate
      : Object.freeze({
          ...aggregate,
          effectiveSeverity: severity,
          visual: Object.freeze({
            ...aggregate.visual,
            blink: false,
            flash: false,
            overlay: "none" as const,
            borderEmphasis: false
          })
        });
  const rank = level(severity);
  return Object.freeze({
    scope: aggregate.scope,
    entityId: aggregate.scopeId,
    revision: options.revision,
    effectiveSeverity: severity,
    effectiveStatus: status,
    acknowledged,
    badge: resolveBadge(presentationAggregate, theme),
    overlay: resolveOverlay(presentationAggregate, theme),
    border: resolveBorder(presentationAggregate, theme),
    fill: resolveFill(presentationAggregate, theme),
    icon: resolveIcon(presentationAggregate, status, theme),
    text: resolveText(presentationAggregate, reduced, theme),
    animation: resolveAnimation(presentationAggregate, reduced),
    decoration: Object.freeze({
      labelEmphasis: rank >= 6 ? "critical" : rank >= 4 ? "strong" : rank > 0 ? "subtle" : "none",
      ...(status === "Disabled" ? { opacityOverride: 0.5 } : {})
    }),
    communicationLoss:
      status === "Offline" || aggregate.effectiveAlarm?.category === "communication",
    flowInterrupted: aggregate.scope === "connection" && (status === "Offline" || rank >= 5),
    criticalHighlight: rank >= 5,
    warningOverlay: rank >= 2 && rank < 5
  });
}
