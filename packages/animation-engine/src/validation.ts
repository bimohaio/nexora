import type {
  AnimationDefinition,
  AnimationEasing,
  AnimationTarget,
  AnimationTiming,
  AnimationTrigger,
  AnimationTypeRegistry,
  ReducedMotionPolicy,
  ValidationIssue,
  ValidationResult,
  VisibilityPolicy
} from "./contracts.js";

const TARGET_KINDS = new Set(["node", "connection", "overlay"]);
const DIRECTIONS = new Set(["normal", "reverse", "alternate", "alternate-reverse"]);
const FILL_MODES = new Set(["none", "forwards", "backwards", "both"]);
const EASINGS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end"
]);
const VISIBILITY_POLICIES = new Set([
  "always-run",
  "pause-offscreen",
  "throttle-offscreen",
  "pause-when-document-hidden"
]);

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message, severity: "error" };
}

function result<T>(value: T, issues: readonly ValidationIssue[]): ValidationResult<T> {
  return issues.length === 0 ? { valid: true, value, issues } : { valid: false, issues };
}

function isSafeSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isSafeSerializable(entry, seen));
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(
    ([key, entry]) =>
      !["__proto__", "prototype", "constructor"].includes(key) && isSafeSerializable(entry, seen)
  );
}

export function validateAnimationTarget(
  target: AnimationTarget
): ValidationResult<AnimationTarget> {
  const issues: ValidationIssue[] = [];
  if (target.entityId.trim() === "")
    issues.push(
      issue("target.entityId", "ANIMATION_TARGET_ENTITY_EMPTY", "Entity ID is required.")
    );
  if (!TARGET_KINDS.has(target.kind))
    issues.push(
      issue("target.kind", "ANIMATION_TARGET_KIND_UNKNOWN", "Target kind is unsupported.")
    );
  if (target.property.trim() === "" || target.property.includes("__proto__"))
    issues.push(
      issue("target.property", "ANIMATION_TARGET_PROPERTY_INVALID", "Target property is invalid.")
    );
  if (target.part?.trim() === "")
    issues.push(
      issue("target.part", "ANIMATION_TARGET_PART_EMPTY", "Target part cannot be empty.")
    );
  return result(target, issues);
}

export function validateAnimationEasing(
  easing: AnimationEasing
): ValidationResult<AnimationEasing> {
  const issues: ValidationIssue[] = [];
  if (typeof easing === "string") {
    if (!EASINGS.has(easing))
      issues.push(issue("timing.easing", "ANIMATION_EASING_UNKNOWN", "Easing is unsupported."));
  } else if (
    ![easing.x1, easing.y1, easing.x2, easing.y2].every(Number.isFinite) ||
    easing.x1 < 0 ||
    easing.x1 > 1 ||
    easing.x2 < 0 ||
    easing.x2 > 1
  )
    issues.push(
      issue("timing.easing", "ANIMATION_EASING_INVALID", "Cubic bezier easing is malformed.")
    );
  return result(easing, issues);
}

export function validateAnimationTiming(
  timing: AnimationTiming
): ValidationResult<AnimationTiming> {
  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(timing.durationMs) || timing.durationMs < 0)
    issues.push(
      issue("timing.durationMs", "ANIMATION_DURATION_INVALID", "Duration must be non-negative.")
    );
  if (timing.delayMs !== undefined && (!Number.isFinite(timing.delayMs) || timing.delayMs < 0))
    issues.push(issue("timing.delayMs", "ANIMATION_DELAY_INVALID", "Delay must be non-negative."));
  if (
    typeof timing.iterations === "number" &&
    (!Number.isFinite(timing.iterations) || timing.iterations <= 0)
  )
    issues.push(
      issue("timing.iterations", "ANIMATION_ITERATIONS_INVALID", "Iterations must be positive.")
    );
  if (
    timing.playbackRate !== undefined &&
    (!Number.isFinite(timing.playbackRate) || timing.playbackRate <= 0)
  )
    issues.push(
      issue(
        "timing.playbackRate",
        "ANIMATION_PLAYBACK_RATE_INVALID",
        "Playback rate must be positive."
      )
    );
  if (timing.direction !== undefined && !DIRECTIONS.has(timing.direction))
    issues.push(
      issue("timing.direction", "ANIMATION_DIRECTION_UNKNOWN", "Direction is unsupported.")
    );
  if (timing.fillMode !== undefined && !FILL_MODES.has(timing.fillMode))
    issues.push(
      issue("timing.fillMode", "ANIMATION_FILL_MODE_UNKNOWN", "Fill mode is unsupported.")
    );
  if (timing.easing !== undefined) issues.push(...validateAnimationEasing(timing.easing).issues);
  return result(timing, issues);
}

export function validateAnimationTrigger(
  trigger: AnimationTrigger
): ValidationResult<AnimationTrigger> {
  const issues: ValidationIssue[] = [];
  switch (trigger.kind) {
    case "runtime-boolean":
    case "runtime-state":
      if (trigger.bindingId.trim() === "")
        issues.push(
          issue("trigger.bindingId", "ANIMATION_TRIGGER_BINDING_EMPTY", "Binding ID is required.")
        );
      break;
    case "binding-result":
      if (trigger.bindingId.trim() === "" || !isSafeSerializable(trigger.condition))
        issues.push(issue("trigger", "ANIMATION_TRIGGER_INVALID", "Binding trigger is invalid."));
      break;
    case "alarm":
      if (trigger.alarmId.trim() === "")
        issues.push(
          issue("trigger.alarmId", "ANIMATION_TRIGGER_ALARM_EMPTY", "Alarm ID is required.")
        );
      break;
    case "manual":
      if (trigger.triggerId.trim() === "")
        issues.push(
          issue("trigger.triggerId", "ANIMATION_TRIGGER_MANUAL_EMPTY", "Trigger ID is required.")
        );
      break;
    default:
      issues.push(
        issue("trigger.kind", "ANIMATION_TRIGGER_UNKNOWN", "Trigger kind is unsupported.")
      );
  }
  return result(trigger, issues);
}

export function validateReducedMotionPolicy(
  policy: ReducedMotionPolicy
): ValidationResult<ReducedMotionPolicy> {
  const issues: ValidationIssue[] = [];
  if (
    policy.mode === "reduce-rate" &&
    (!Number.isFinite(policy.factor) || policy.factor <= 0 || policy.factor >= 1)
  )
    issues.push(
      issue(
        "reducedMotion.factor",
        "REDUCED_MOTION_FACTOR_INVALID",
        "Reduced-rate factor must be greater than zero and less than one."
      )
    );
  return result(policy, issues);
}

export function validateVisibilityPolicy(
  policy: VisibilityPolicy
): ValidationResult<VisibilityPolicy> {
  const issues = VISIBILITY_POLICIES.has(policy)
    ? []
    : [issue("visibility", "VISIBILITY_POLICY_UNKNOWN", "Visibility policy is unsupported.")];
  return result(policy, issues);
}

export function validateAnimationDefinition(
  definition: AnimationDefinition,
  registry: AnimationTypeRegistry
): ValidationResult<AnimationDefinition> {
  const issues: ValidationIssue[] = [];
  if (definition.id.trim() === "")
    issues.push(issue("id", "ANIMATION_ID_EMPTY", "Animation definition ID is required."));
  const registered = registry.get(definition.type);
  if (registered === undefined)
    issues.push(issue("type", "ANIMATION_TYPE_UNKNOWN", "Animation type is not registered."));
  issues.push(...validateAnimationTarget(definition.target).issues);
  issues.push(...validateAnimationTiming(definition.timing).issues);
  if (definition.trigger !== undefined)
    issues.push(...validateAnimationTrigger(definition.trigger).issues);
  if (definition.reducedMotion !== undefined)
    issues.push(...validateReducedMotionPolicy(definition.reducedMotion).issues);
  if (definition.visibility !== undefined)
    issues.push(...validateVisibilityPolicy(definition.visibility).issues);
  if (registered !== undefined && !registered.supportedTargets.includes(definition.target.property))
    issues.push(
      issue(
        "target.property",
        "ANIMATION_TARGET_UNSUPPORTED",
        "Animation type does not support this target property."
      )
    );
  if (definition.parameters !== undefined) {
    if (!isSafeSerializable(definition.parameters))
      issues.push(
        issue("parameters", "ANIMATION_PARAMETERS_UNSAFE", "Parameters must be safe JSON data.")
      );
    else if (registered?.validateParameters !== undefined)
      issues.push(...registered.validateParameters(definition.parameters));
  }
  return result(definition, issues);
}
