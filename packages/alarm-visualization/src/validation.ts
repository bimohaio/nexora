import type { ValidationIssue, ValidationResult } from "@web-scada/animation-engine";
import type {
  AlarmCondition,
  AlarmDefinition,
  AlarmSeverityRegistry,
  AlarmState,
  AlarmVisualRule
} from "./contracts.js";

const QUALITIES = new Set(["good", "uncertain", "bad", "offline", "unknown"]);
const OVERLAYS = new Set([
  "none",
  "badge",
  "border",
  "corner-indicator",
  "icon",
  "label",
  "pattern"
]);
const INDICATORS = new Set(["none", "icon", "badge", "label", "pattern"]);

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message, severity: "error" };
}
function result<T>(value: T, issues: readonly ValidationIssue[]): ValidationResult<T> {
  return issues.length === 0 ? { valid: true, value, issues } : { valid: false, issues };
}
function finiteOptional(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

export function validateAlarmCondition(
  condition: AlarmCondition
): ValidationResult<AlarmCondition> {
  const issues: ValidationIssue[] = [];
  switch (condition.kind) {
    case "boolean":
      break;
    case "threshold":
      if (!Number.isFinite(condition.threshold))
        issues.push(
          issue("condition.threshold", "ALARM_THRESHOLD_INVALID", "Threshold must be finite.")
        );
      break;
    case "state":
      if (condition.expected.trim() === "")
        issues.push(
          issue("condition.expected", "ALARM_STATE_EMPTY", "Expected state is required.")
        );
      break;
    case "quality":
      if (
        condition.qualities.length === 0 ||
        condition.qualities.some((quality) => !QUALITIES.has(quality))
      )
        issues.push(
          issue("condition.qualities", "ALARM_QUALITY_INVALID", "Qualities are invalid.")
        );
      break;
    case "binding-result":
      if (condition.bindingId.trim() === "" || typeof condition.expected === "function")
        issues.push(
          issue("condition", "ALARM_BINDING_CONDITION_INVALID", "Binding condition is invalid.")
        );
      break;
    default:
      issues.push(issue("condition.kind", "ALARM_CONDITION_UNKNOWN", "Condition is unsupported."));
  }
  return result(condition, issues);
}

export function validateAlarmVisualRule(
  rule: AlarmVisualRule,
  severities: AlarmSeverityRegistry
): ValidationResult<AlarmVisualRule> {
  const issues: ValidationIssue[] = [];
  if (severities.get(rule.severity) === undefined)
    issues.push(issue("visual.severity", "ALARM_SEVERITY_UNKNOWN", "Severity is not registered."));
  if (rule.overlay !== undefined && !OVERLAYS.has(rule.overlay))
    issues.push(issue("visual.overlay", "ALARM_OVERLAY_UNKNOWN", "Overlay is unsupported."));
  if (rule.indicator !== undefined && !INDICATORS.has(rule.indicator))
    issues.push(issue("visual.indicator", "ALARM_INDICATOR_UNKNOWN", "Indicator is unsupported."));
  if (
    rule.animation !== undefined &&
    (rule.animation.definitionId.trim() === "" ||
      (rule.reducedMotionFallback === undefined &&
        (rule.overlay === undefined || rule.overlay === "none") &&
        (rule.indicator === undefined || rule.indicator === "none")))
  )
    issues.push(
      issue(
        "visual.animation",
        "ALARM_MOTION_ONLY_UNSAFE",
        "Animated alarm visuals require a static non-motion cue."
      )
    );
  for (const [path, token] of [
    ["visual.colorToken", rule.colorToken],
    ["visual.borderToken", rule.borderToken],
    ["visual.iconToken", rule.iconToken]
  ] as const)
    if (token !== undefined && !/^[a-z][a-z0-9._-]*$/i.test(token))
      issues.push(issue(path, "ALARM_SEMANTIC_TOKEN_INVALID", "Semantic token is invalid."));
  return result(rule, issues);
}

export function validateAlarmDefinition(
  definition: AlarmDefinition,
  severities: AlarmSeverityRegistry
): ValidationResult<AlarmDefinition> {
  const issues: ValidationIssue[] = [];
  if (definition.id.trim() === "")
    issues.push(issue("id", "ALARM_ID_EMPTY", "Alarm ID is required."));
  if (definition.source.sourceId.trim() === "")
    issues.push(issue("source.sourceId", "ALARM_SOURCE_EMPTY", "Alarm source ID is required."));
  if (severities.get(definition.severity) === undefined)
    issues.push(issue("severity", "ALARM_SEVERITY_UNKNOWN", "Severity is not registered."));
  if (definition.message !== undefined && definition.message.length > 1024)
    issues.push(
      issue("message", "ALARM_MESSAGE_TOO_LONG", "Alarm message exceeds 1024 characters.")
    );
  issues.push(...validateAlarmCondition(definition.condition).issues);
  if (definition.visual !== undefined)
    issues.push(...validateAlarmVisualRule(definition.visual, severities).issues);
  return result(definition, issues);
}

export function validateAlarmState(
  state: AlarmState,
  severities: AlarmSeverityRegistry
): ValidationResult<AlarmState> {
  const issues: ValidationIssue[] = [];
  if (severities.get(state.severity) === undefined)
    issues.push(issue("severity", "ALARM_SEVERITY_UNKNOWN", "Severity is not registered."));
  if (state.active !== (state.lifecycle === "active"))
    issues.push(
      issue("active", "ALARM_ACTIVE_STATE_INCONSISTENT", "Active flag and lifecycle differ.")
    );
  if (
    !finiteOptional(state.activatedAt) ||
    !finiteOptional(state.returnedToNormalAt) ||
    !finiteOptional(state.acknowledgedAt) ||
    !finiteOptional(state.shelvedUntil)
  )
    issues.push(issue("timestamps", "ALARM_TIMESTAMP_INVALID", "Alarm timestamps must be finite."));
  if (state.acknowledgment === "acknowledged" && state.acknowledgedAt === undefined)
    issues.push(
      issue("acknowledgedAt", "ALARM_ACK_TIMESTAMP_MISSING", "Acknowledgment time is required.")
    );
  if (state.shelving === "shelved-until" && state.shelvedUntil === undefined)
    issues.push(
      issue("shelvedUntil", "ALARM_SHELVING_TIME_MISSING", "Shelving expiration is required.")
    );
  if (state.revision < 0 || !Number.isInteger(state.revision))
    issues.push(issue("revision", "ALARM_REVISION_INVALID", "Revision must be non-negative."));
  return result(state, issues);
}
