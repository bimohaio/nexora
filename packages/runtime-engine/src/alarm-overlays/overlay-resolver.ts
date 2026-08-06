import type { AlarmPresentation } from "../alarm-visual/types.js";
import type {
  AcknowledgementOverlay,
  OverlayBadge,
  OverlayLayer,
  OverlayMask,
  OverlayResolveOptions,
  OverlayRibbon,
  OverlayStack,
  OverlayTheme,
  OverlayTooltipMetadata,
  OverlayType,
  WarningOverlay
} from "./types.js";

export const DEFAULT_OVERLAY_THEME: OverlayTheme = Object.freeze({ id: "default" });
const PRIORITY: Readonly<Record<OverlayType, number>> = Object.freeze({
  emergency: 700,
  "critical-warning": 600,
  "process-warning": 400,
  "communication-lost": 550,
  maintenance: 300,
  "out-of-service": 290,
  offline: 520,
  disabled: 510,
  suppressed: 280,
  shelved: 270,
  unacknowledged: 450,
  acknowledged: 200,
  custom: 100
});
export function resolvePriority(type: OverlayType): number {
  return PRIORITY[type];
}
function token(theme: OverlayTheme, type: OverlayType, role: string): string {
  const semantic = `overlay.${type}.${role}`;
  return theme.tokens?.[semantic] ?? semantic;
}
function tooltip(presentation: AlarmPresentation, type: OverlayType): OverlayTooltipMetadata {
  return Object.freeze({
    title: type.replaceAll("-", " "),
    description: `${presentation.effectiveStatus} ${presentation.effectiveSeverity}`,
    severity: presentation.effectiveSeverity,
    acknowledgementState: presentation.acknowledged
      ? "acknowledged"
      : presentation.effectiveSeverity === "none"
        ? "not-required"
        : "unacknowledged"
  });
}
function layer(
  presentation: AlarmPresentation,
  theme: OverlayTheme,
  type: OverlayType,
  kind: OverlayLayer["kind"],
  placement: OverlayLayer["placement"],
  motion: OverlayLayer["motion"] = []
): OverlayLayer {
  return Object.freeze({
    id: `${type}:${kind}:${placement}`,
    type,
    kind,
    placement,
    priority: resolvePriority(type),
    token: token(theme, type, kind),
    visible: true,
    motion: Object.freeze([...motion]),
    tooltip: tooltip(presentation, type)
  });
}
function primaryType(p: AlarmPresentation): OverlayType | undefined {
  if (p.effectiveStatus === "Disabled") return "disabled";
  if (p.effectiveStatus === "Offline" || p.effectiveStatus === "Unknown") return "offline";
  if (p.effectiveStatus === "Maintenance") return "maintenance";
  if (p.effectiveStatus === "OutOfService") return "out-of-service";
  if (p.effectiveStatus === "Suppressed") return "suppressed";
  if (p.effectiveStatus === "Shelved") return "shelved";
  if (p.communicationLoss) return "communication-lost";
  if (p.effectiveSeverity === "emergency") return "emergency";
  if (p.criticalHighlight) return "critical-warning";
  if (p.warningOverlay) return "process-warning";
  return undefined;
}
export function resolveBadge(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  type: OverlayType = p.acknowledged ? "acknowledged" : "unacknowledged"
): OverlayBadge {
  return Object.freeze({ layer: layer(p, theme, type, "badge", "top-right") });
}
export function resolveRibbon(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  type: OverlayType = primaryType(p) ?? "custom"
): OverlayRibbon {
  return Object.freeze({
    layer: layer(p, theme, type, "ribbon", "center"),
    label: type.replaceAll("-", " ")
  });
}
export function resolveMask(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  type: OverlayType = primaryType(p) ?? "custom"
): OverlayMask {
  return Object.freeze({
    layer: layer(p, theme, type, "mask", "entire-symbol"),
    opacity: type === "disabled" ? 0.5 : 0.28
  });
}
export function resolveAcknowledgement(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  reduced = false
): AcknowledgementOverlay {
  const type = p.acknowledged ? "acknowledged" : "unacknowledged";
  return Object.freeze({
    acknowledged: p.acknowledged,
    badge: resolveBadge(p, theme, type),
    ribbon: resolveRibbon(p, theme, type),
    border: layer(p, theme, type, "border", "border", reduced ? [] : ["pulse"]),
    cornerMarker: Object.freeze({
      layer: layer(p, theme, type, "indicator", "top-right"),
      iconToken: token(theme, type, "icon")
    }),
    pulseRequested: !reduced && !p.acknowledged,
    highlighted: !p.acknowledged
  });
}
export function resolveWarning(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  reduced = false
): WarningOverlay {
  const type: OverlayType = p.criticalHighlight ? "critical-warning" : "process-warning";
  return Object.freeze({
    triangle: Object.freeze({
      layer: layer(p, theme, type, "indicator", "top-left"),
      iconToken: token(theme, type, "icon")
    }),
    banner: resolveRibbon(p, theme, type),
    corner: Object.freeze({
      layer: layer(p, theme, type, "indicator", "top-left"),
      iconToken: token(theme, type, "icon")
    }),
    border: layer(p, theme, type, "border", "border", reduced ? [] : ["glow"]),
    glowRequested: !reduced,
    fillToken: token(theme, type, "fill"),
    iconToken: token(theme, type, "icon"),
    badge: resolveBadge(p, theme, type)
  });
}
export function resolveOverlay(
  p: AlarmPresentation,
  theme = DEFAULT_OVERLAY_THEME,
  reduced = false
): readonly OverlayLayer[] {
  const layers: OverlayLayer[] = [];
  const type = primaryType(p);
  if (type !== undefined) {
    layers.push(resolveRibbon(p, theme, type).layer, resolveMask(p, theme, type).layer);
  }
  if (p.effectiveSeverity !== "none") {
    const ack = resolveAcknowledgement(p, theme, reduced);
    layers.push(ack.badge.layer, ack.border, ack.cornerMarker.layer);
  }
  if (p.warningOverlay || p.criticalHighlight) {
    const warning = resolveWarning(p, theme, reduced);
    layers.push(warning.banner.layer, warning.border, warning.triangle.layer, warning.badge.layer);
  }
  return Object.freeze(layers);
}
export function resolveOverlayStack(options: OverlayResolveOptions): OverlayStack {
  const maximumCount = options.maximumCount ?? 8;
  if (!Number.isInteger(maximumCount) || maximumCount < 1)
    throw new RangeError("Maximum overlay count must be a positive integer.");
  if (options.enabled === false)
    return Object.freeze({
      entityId: options.presentation.entityId,
      scope: options.presentation.scope,
      layers: Object.freeze([]),
      maximumCount,
      truncated: false
    });
  const theme = options.theme ?? DEFAULT_OVERLAY_THEME;
  const reduced = options.motionPreference === "reduce";
  const combined = [
    ...resolveOverlay(options.presentation, theme, reduced),
    ...(options.customLayers ?? [])
  ].filter(({ visible }) => visible);
  const unique = new Map<string, OverlayLayer>();
  for (const candidate of combined) {
    const existing = unique.get(candidate.id);
    if (existing === undefined || candidate.priority > existing.priority)
      unique.set(candidate.id, candidate);
  }
  const ordered = [...unique.values()].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  );
  const layers = Object.freeze(
    ordered
      .slice(0, maximumCount)
      .map((entry) =>
        reduced && entry.motion.length > 0
          ? Object.freeze({ ...entry, motion: Object.freeze([]) })
          : entry
      )
  );
  return Object.freeze({
    entityId: options.presentation.entityId,
    scope: options.presentation.scope,
    layers,
    ...(options.presentation.effectiveSeverity === "none"
      ? {}
      : { acknowledgement: resolveAcknowledgement(options.presentation, theme, reduced) }),
    ...(options.presentation.warningOverlay || options.presentation.criticalHighlight
      ? { warning: resolveWarning(options.presentation, theme, reduced) }
      : {}),
    maximumCount,
    truncated: ordered.length > maximumCount
  });
}
