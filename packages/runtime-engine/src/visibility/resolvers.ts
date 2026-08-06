import type {
  AccessibilityPresentation,
  AnimationPermission,
  ContrastMode,
  ContrastPolicy,
  MotionPolicy,
  MotionPreferenceInputs,
  RuntimeOptimizationFlags,
  RuntimeRectangle,
  RuntimeVisibilityEntry,
  RuntimeVisibilityState,
  RuntimeViewport,
  VisibilityInput
} from "./types.js";

export function resolveMotionPolicy(inputs: MotionPreferenceInputs): MotionPolicy {
  return (
    inputs.runtimeOverride ??
    inputs.user ??
    inputs.document ??
    inputs.application ??
    inputs.system ??
    "full-motion"
  );
}
function validRect(rect: RuntimeRectangle): void {
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new TypeError("Visibility rectangle must be finite and non-negative.");
}
export function resolveViewportVisibility(
  bounds: RuntimeRectangle,
  viewport: RuntimeViewport
): {
  readonly state: "visible" | "partially-visible" | "outside-viewport";
  readonly fraction: number;
} {
  validRect(bounds);
  validRect(viewport);
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0)
    throw new TypeError("Viewport zoom must be positive and finite.");
  const left = Math.max(bounds.x, viewport.x);
  const top = Math.max(bounds.y, viewport.y);
  const right = Math.min(bounds.x + bounds.width, viewport.x + viewport.width / viewport.zoom);
  const bottom = Math.min(bounds.y + bounds.height, viewport.y + viewport.height / viewport.zoom);
  const area = bounds.width * bounds.height;
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const fraction = area === 0 ? 0 : Math.min(1, intersection / area);
  return Object.freeze({
    state: fraction === 0 ? "outside-viewport" : fraction === 1 ? "visible" : "partially-visible",
    fraction
  });
}
export function resolveVisibility(input: VisibilityInput): {
  readonly state: RuntimeVisibilityState;
  readonly fraction: number;
} {
  if (
    input.documentVisible === false ||
    input.explicitVisible === false ||
    input.layerVisible === false ||
    input.groupVisible === false
  )
    return Object.freeze({ state: "hidden", fraction: 0 });
  if (input.collapsed === true) return Object.freeze({ state: "collapsed", fraction: 0 });
  if (input.disabled === true) return Object.freeze({ state: "disabled", fraction: 0 });
  if (input.occluded === true) return Object.freeze({ state: "occluded", fraction: 0 });
  const resolved = resolveViewportVisibility(input.bounds, input.viewport);
  return Object.freeze({ state: resolved.state, fraction: resolved.fraction });
}
export function resolveContrast(
  mode: ContrastMode,
  alarm?: VisibilityInput["alarmPresentation"]
): ContrastPolicy {
  const category =
    alarm?.communicationLoss === true
      ? "communication"
      : alarm?.effectiveStatus === "Offline"
        ? "offline"
        : alarm?.effectiveSeverity === "critical" || alarm?.effectiveSeverity === "emergency"
          ? "critical"
          : alarm?.warningOverlay === true
            ? "warning"
            : alarm?.acknowledged === true
              ? "ack"
              : "normal";
  return Object.freeze({
    mode,
    token: `contrast.${category}`,
    colorIndependent: true,
    shapeIndicator: true,
    patternIndicator: mode !== "normal",
    badgeIndicator: true
  });
}
export function resolveAnimationPermission(
  visibility: RuntimeVisibilityState,
  motion: MotionPolicy
): AnimationPermission {
  const invisible = visibility !== "visible" && visibility !== "partially-visible";
  const staticMotion = motion === "static-mode" || motion === "accessibility-mode";
  const minimal = motion === "minimal-motion" || motion === "reduced-motion";
  return Object.freeze({
    animation: !invisible && !staticMotion,
    overlayAnimation: !invisible && !staticMotion && !minimal,
    particles: !invisible && motion === "full-motion",
    glow: !invisible && (motion === "full-motion" || motion === "diagnostic-mode"),
    scheduler: invisible ? "pause" : "run",
    reason: invisible ? visibility : staticMotion ? motion : minimal ? "motion-reduced" : "allowed"
  });
}
export function resolveAccessibilityPresentation(
  motion: MotionPolicy,
  criticalAlarm: boolean
): AccessibilityPresentation {
  const reduced = motion !== "full-motion" && motion !== "diagnostic-mode";
  return Object.freeze({
    preserveAlarmVisibility: criticalAlarm,
    staticBorder: criticalAlarm || reduced,
    solidOverlay: criticalAlarm || reduced,
    contrastBorder: criticalAlarm || motion === "accessibility-mode",
    priorityBadge: criticalAlarm,
    statusRibbon: criticalAlarm,
    labelHighlight: criticalAlarm || reduced,
    accessibilityIcon: criticalAlarm
  });
}
export function resolveOptimization(
  visibility: RuntimeVisibilityState,
  permission: AnimationPermission
): RuntimeOptimizationFlags {
  const invisible = visibility !== "visible" && visibility !== "partially-visible";
  return Object.freeze({
    cull: invisible,
    virtualize:
      visibility === "outside-viewport" || visibility === "hidden" || visibility === "collapsed",
    pauseAnimation: !permission.animation,
    pauseOverlays: !permission.overlayAnimation,
    pauseParticles: !permission.particles,
    pauseGlow: !permission.glow,
    retainState: true
  });
}
export function resolveVisibilityEntry(
  input: VisibilityInput,
  motionPolicy: MotionPolicy,
  contrastMode: ContrastMode
): RuntimeVisibilityEntry {
  const { state, fraction } = resolveVisibility(input);
  const criticalAlarm =
    input.alarmPresentation?.effectiveSeverity === "critical" ||
    input.alarmPresentation?.effectiveSeverity === "emergency";
  const permission = resolveAnimationPermission(state, motionPolicy);
  return Object.freeze({
    entityId: input.entityId,
    visibility: state,
    motionPolicy,
    contrast: resolveContrast(contrastMode, input.alarmPresentation),
    permission,
    accessibility: resolveAccessibilityPresentation(motionPolicy, criticalAlarm),
    optimization: resolveOptimization(state, permission),
    viewport: Object.freeze({ ...input.viewport }),
    visibleFraction: fraction,
    criticalAlarm
  });
}
