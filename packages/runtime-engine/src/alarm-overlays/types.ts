import type {
  AlarmMotionPreference,
  AlarmPresentation,
  AlarmPresentationScope,
  AlarmThemeToken,
  AlarmVisualSnapshot
} from "../alarm-visual/types.js";

export type OverlayType =
  | "acknowledged"
  | "unacknowledged"
  | "critical-warning"
  | "process-warning"
  | "communication-lost"
  | "maintenance"
  | "out-of-service"
  | "offline"
  | "disabled"
  | "suppressed"
  | "shelved"
  | "emergency"
  | "custom";
export type OverlayPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "border"
  | "entire-symbol"
  | "connection-center"
  | "connection-endpoint";
export type OverlayLayerKind =
  "badge" | "ribbon" | "mask" | "indicator" | "border" | "fill" | "icon";
export type OverlayMotionRequest = "pulse" | "blink" | "flash" | "glow";
export interface OverlayTooltipMetadata {
  readonly title: string;
  readonly description: string;
  readonly severity: string;
  readonly timestamp?: number;
  readonly alarmCode?: string;
  readonly acknowledgementState: "acknowledged" | "unacknowledged" | "not-required";
  readonly category?: string;
  readonly source?: string;
}
export interface OverlayLayer {
  readonly id: string;
  readonly type: OverlayType;
  readonly kind: OverlayLayerKind;
  readonly placement: OverlayPlacement;
  readonly priority: number;
  readonly token: AlarmThemeToken;
  readonly visible: boolean;
  readonly motion: readonly OverlayMotionRequest[];
  readonly tooltip: OverlayTooltipMetadata;
}
export interface OverlayBadge {
  readonly layer: OverlayLayer;
  readonly count?: number;
}
export interface OverlayRibbon {
  readonly layer: OverlayLayer;
  readonly label: string;
}
export interface OverlayMask {
  readonly layer: OverlayLayer;
  readonly opacity: number;
}
export interface OverlayIndicator {
  readonly layer: OverlayLayer;
  readonly iconToken: AlarmThemeToken;
}
export interface AcknowledgementOverlay {
  readonly acknowledged: boolean;
  readonly badge: OverlayBadge;
  readonly ribbon: OverlayRibbon;
  readonly border: OverlayLayer;
  readonly cornerMarker: OverlayIndicator;
  readonly pulseRequested: boolean;
  readonly highlighted: boolean;
}
export interface WarningOverlay {
  readonly triangle: OverlayIndicator;
  readonly banner: OverlayRibbon;
  readonly corner: OverlayIndicator;
  readonly border: OverlayLayer;
  readonly glowRequested: boolean;
  readonly fillToken: AlarmThemeToken;
  readonly iconToken: AlarmThemeToken;
  readonly badge: OverlayBadge;
}
export interface OverlayStack {
  readonly entityId: string;
  readonly scope: AlarmPresentationScope;
  readonly layers: readonly OverlayLayer[];
  readonly acknowledgement?: AcknowledgementOverlay;
  readonly warning?: WarningOverlay;
  readonly maximumCount: number;
  readonly truncated: boolean;
}
export interface OverlayTheme {
  readonly id: string;
  readonly tokens?: Readonly<Record<string, AlarmThemeToken>>;
}
export interface OverlayResolveOptions {
  readonly presentation: AlarmPresentation;
  readonly theme?: OverlayTheme;
  readonly motionPreference?: AlarmMotionPreference;
  readonly enabled?: boolean;
  readonly maximumCount?: number;
  readonly customLayers?: readonly OverlayLayer[];
}
export interface OverlaySnapshot {
  readonly revision: number;
  readonly presentationRevision: number;
  readonly timestamp: number;
  readonly themeId: string;
  readonly motionPreference: AlarmMotionPreference;
  readonly symbols: ReadonlyMap<string, OverlayStack>;
  readonly connections: ReadonlyMap<string, OverlayStack>;
  readonly groups: ReadonlyMap<string, OverlayStack>;
  readonly layers: ReadonlyMap<string, OverlayStack>;
  readonly document: OverlayStack;
}
export interface OverlayDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedSymbolIds: readonly string[];
  readonly changedConnectionIds: readonly string[];
  readonly changedGroupIds: readonly string[];
  readonly changedLayerIds: readonly string[];
  readonly documentChanged: boolean;
  readonly reason: "presentation" | "theme" | "motion" | "policy";
}
export interface OverlayUpdate {
  readonly changed: boolean;
  readonly snapshot: OverlaySnapshot;
  readonly diff?: OverlayDiff;
}
export interface OverlayStoreOptions {
  readonly theme?: OverlayTheme;
  readonly motionPreference?: AlarmMotionPreference;
  readonly enabled?: boolean;
  readonly maximumCount?: number;
  readonly now?: () => number;
}
export type OverlayPresentationSource = AlarmVisualSnapshot;
