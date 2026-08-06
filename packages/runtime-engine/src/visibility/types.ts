import type { AlarmPresentation } from "../alarm-visual/types.js";

export type MotionPolicy =
  | "full-motion"
  | "reduced-motion"
  | "minimal-motion"
  | "static-mode"
  | "accessibility-mode"
  | "diagnostic-mode";
export type MotionPreferenceValue = MotionPolicy | "system";
export interface MotionPreferenceInputs {
  readonly system?: MotionPolicy;
  readonly application?: MotionPolicy;
  readonly document?: MotionPolicy;
  readonly user?: MotionPolicy;
  readonly runtimeOverride?: MotionPolicy;
}
export type RuntimeVisibilityState =
  | "visible"
  | "partially-visible"
  | "hidden"
  | "outside-viewport"
  | "occluded"
  | "collapsed"
  | "disabled";
export type ContrastMode = "normal" | "high-contrast" | "forced-contrast";
export interface RuntimeRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface RuntimeViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
}
export interface VisibilityInput {
  readonly entityId: string;
  readonly bounds: RuntimeRectangle;
  readonly viewport: RuntimeViewport;
  readonly explicitVisible?: boolean;
  readonly layerVisible?: boolean;
  readonly groupVisible?: boolean;
  readonly documentVisible?: boolean;
  readonly collapsed?: boolean;
  readonly disabled?: boolean;
  readonly occluded?: boolean;
  readonly alarmPresentation?: AlarmPresentation;
}
export interface ContrastPolicy {
  readonly mode: ContrastMode;
  readonly token: string;
  readonly colorIndependent: boolean;
  readonly shapeIndicator: boolean;
  readonly patternIndicator: boolean;
  readonly badgeIndicator: boolean;
}
export interface AnimationPermission {
  readonly animation: boolean;
  readonly overlayAnimation: boolean;
  readonly particles: boolean;
  readonly glow: boolean;
  readonly scheduler: "run" | "pause";
  readonly reason: string;
}
export interface AccessibilityPresentation {
  readonly preserveAlarmVisibility: boolean;
  readonly staticBorder: boolean;
  readonly solidOverlay: boolean;
  readonly contrastBorder: boolean;
  readonly priorityBadge: boolean;
  readonly statusRibbon: boolean;
  readonly labelHighlight: boolean;
  readonly accessibilityIcon: boolean;
}
export interface RuntimeOptimizationFlags {
  readonly cull: boolean;
  readonly virtualize: boolean;
  readonly pauseAnimation: boolean;
  readonly pauseOverlays: boolean;
  readonly pauseParticles: boolean;
  readonly pauseGlow: boolean;
  readonly retainState: true;
}
export interface RuntimeVisibilityEntry {
  readonly entityId: string;
  readonly visibility: RuntimeVisibilityState;
  readonly motionPolicy: MotionPolicy;
  readonly contrast: ContrastPolicy;
  readonly permission: AnimationPermission;
  readonly accessibility: AccessibilityPresentation;
  readonly optimization: RuntimeOptimizationFlags;
  readonly viewport: RuntimeViewport;
  readonly visibleFraction: number;
  readonly criticalAlarm: boolean;
}
export interface RuntimeVisibilitySnapshot {
  readonly revision: number;
  readonly timestamp: number;
  readonly motionPolicy: MotionPolicy;
  readonly contrastMode: ContrastMode;
  readonly entries: ReadonlyMap<string, RuntimeVisibilityEntry>;
  readonly diagnostics: RuntimeVisibilityDiagnostics;
}
export interface RuntimeVisibilityDiagnostics {
  readonly totalSymbols: number;
  readonly visibleSymbols: number;
  readonly partiallyVisibleSymbols: number;
  readonly hiddenSymbols: number;
  readonly pausedAnimations: number;
  readonly runningAnimations: number;
  readonly reducedMotionState: MotionPolicy;
  readonly contrastMode: ContrastMode;
  readonly culledSymbols: number;
  readonly occludedSymbols: number;
  readonly changedNodes: number;
}
export interface RuntimeVisibilityDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedEntityIds: readonly string[];
  readonly removedEntityIds: readonly string[];
  readonly reason: "entities" | "viewport" | "motion" | "contrast" | "document";
}
export interface RuntimeVisibilityUpdate {
  readonly changed: boolean;
  readonly snapshot: RuntimeVisibilitySnapshot;
  readonly diff?: RuntimeVisibilityDiff;
}
export interface VisibilityManagerOptions {
  readonly motion?: MotionPreferenceInputs;
  readonly contrastMode?: ContrastMode;
  readonly now?: () => number;
}
export interface VisibilitySchedulerTarget {
  setEntityVisibility(entityId: string, visibility: "visible" | "offscreen"): void;
  setReducedMotion(value: "reduce" | "no-preference"): void;
}
