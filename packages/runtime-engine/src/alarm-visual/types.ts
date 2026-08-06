import type {
  AlarmAggregate,
  AlarmOverlayPolicy,
  AlarmSeverity,
  AlarmStatus
} from "../alarm/types.js";

export type AlarmOverlayKind =
  | "none"
  | "solid"
  | "tint"
  | "corner-indicator"
  | "outline"
  | "glow-request"
  | "cross-hatch"
  | "striped"
  | "mask"
  | "priority-badge"
  | "status-ribbon";
export type AlarmBadgeKind =
  | "none"
  | "circle"
  | "triangle"
  | "diamond"
  | "square"
  | "octagon"
  | "numeric"
  | "stacked"
  | "count"
  | "priority";
export type AlarmIconKind =
  | "none"
  | "warning"
  | "alarm"
  | "fire"
  | "electrical"
  | "communication"
  | "maintenance"
  | "offline"
  | "security"
  | "information"
  | "emergency";
export type AlarmBorderKind =
  | "none"
  | "solid"
  | "pattern"
  | "dash"
  | "glow"
  | "double"
  | "animated"
  | "corner-highlight"
  | "severity";
export type AlarmAnimationKind = "blink" | "flash" | "pulse" | "glow";
export type AlarmMotionPreference = "no-preference" | "reduce";
export type AlarmPresentationScope = "symbol" | "connection" | "group" | "layer" | "document";
export type AlarmThemeToken = string;

export interface AlarmBadge {
  readonly kind: AlarmBadgeKind;
  readonly token: AlarmThemeToken;
  readonly count?: number;
  readonly label?: string;
}
export interface AlarmOverlay {
  readonly kind: AlarmOverlayKind;
  readonly token: AlarmThemeToken;
  readonly opacity?: number;
}
export interface AlarmBorder {
  readonly kind: AlarmBorderKind;
  readonly token: AlarmThemeToken;
  readonly thickness: number;
  readonly emphasized: boolean;
}
export interface AlarmFill {
  readonly token: AlarmThemeToken;
  readonly tintToken?: AlarmThemeToken;
  readonly patternToken?: AlarmThemeToken;
  readonly opacity: number;
  readonly gradientRequest: boolean;
  readonly textureRequest: boolean;
}
export interface AlarmIcon {
  readonly kind: AlarmIconKind;
  readonly token: AlarmThemeToken;
}
export interface AlarmText {
  readonly colorToken: AlarmThemeToken;
  readonly weight: "normal" | "medium" | "bold";
  readonly blink: boolean;
  readonly underline: boolean;
  readonly outline: boolean;
  readonly contrastBoost: boolean;
}
export interface AlarmAnimationPolicy {
  readonly requests: readonly AlarmAnimationKind[];
  readonly reducedMotion: boolean;
  readonly staticFallback: boolean;
}
export interface AlarmDecoration {
  readonly labelEmphasis: "none" | "subtle" | "strong" | "critical";
  readonly opacityOverride?: number;
}
export interface AlarmPresentation {
  readonly scope: AlarmPresentationScope;
  readonly entityId: string;
  readonly revision: number;
  readonly effectiveSeverity: AlarmSeverity;
  readonly effectiveStatus: AlarmStatus;
  readonly acknowledged: boolean;
  readonly badge: AlarmBadge;
  readonly overlay: AlarmOverlay;
  readonly border: AlarmBorder;
  readonly fill: AlarmFill;
  readonly icon: AlarmIcon;
  readonly text: AlarmText;
  readonly animation: AlarmAnimationPolicy;
  readonly decoration: AlarmDecoration;
  readonly communicationLoss: boolean;
  readonly flowInterrupted: boolean;
  readonly criticalHighlight: boolean;
  readonly warningOverlay: boolean;
}
export interface AlarmTheme {
  readonly id: string;
  readonly tokens?: Readonly<Record<string, AlarmThemeToken>>;
}
export interface ResolvePresentationOptions {
  readonly aggregate: AlarmAggregate;
  readonly revision: number;
  readonly theme?: AlarmTheme;
  readonly motionPreference?: AlarmMotionPreference;
  readonly statusOverride?: AlarmStatus;
}
export interface AlarmVisualSnapshot {
  readonly revision: number;
  readonly alarmRevision: number;
  readonly timestamp: number;
  readonly themeId: string;
  readonly motionPreference: AlarmMotionPreference;
  readonly symbols: ReadonlyMap<string, AlarmPresentation>;
  readonly connections: ReadonlyMap<string, AlarmPresentation>;
  readonly groups: ReadonlyMap<string, AlarmPresentation>;
  readonly layers: ReadonlyMap<string, AlarmPresentation>;
  readonly document: AlarmPresentation;
}
export interface AlarmVisualDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedSymbolIds: readonly string[];
  readonly changedConnectionIds: readonly string[];
  readonly changedGroupIds: readonly string[];
  readonly changedLayerIds: readonly string[];
  readonly documentChanged: boolean;
  readonly reason: "alarm" | "theme" | "motion";
}
export interface AlarmVisualUpdate {
  readonly changed: boolean;
  readonly snapshot: AlarmVisualSnapshot;
  readonly diff?: AlarmVisualDiff;
}

export function presentationOverlayFromPolicy(policy: AlarmOverlayPolicy): AlarmOverlayKind {
  const mapping: Readonly<Record<string, AlarmOverlayKind>> = {
    none: "none",
    badge: "priority-badge",
    border: "outline",
    icon: "corner-indicator",
    pattern: "cross-hatch"
  };
  return mapping[policy] ?? "tint";
}
