import type {
  AnimationVisualState,
  Phase10Diagnostic,
  ReducedMotionPolicy,
  ValidationResult
} from "@web-scada/animation-engine";
import type { DataQuality } from "@web-scada/runtime-engine";

export type AlarmId = string & { readonly __brand: "AlarmId" };
export type AlarmSeverityId = string & { readonly __brand: "AlarmSeverityId" };
export type AlarmPriority = number;
export type AlarmSeverity = "information" | "warning" | "alarm" | "critical";

export interface AlarmSource {
  readonly kind: "binding" | "runtime-value" | "entity-state" | "quality";
  readonly sourceId: string;
  readonly entityId?: string;
}
export type AlarmCondition =
  | { readonly kind: "boolean"; readonly expected: boolean }
  | {
      readonly kind: "threshold";
      readonly operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
      readonly threshold: number;
    }
  | { readonly kind: "state"; readonly expected: string }
  | { readonly kind: "quality"; readonly qualities: readonly DataQuality[] }
  | { readonly kind: "binding-result"; readonly bindingId: string; readonly expected: unknown };

export interface AlarmDefinition {
  readonly id: AlarmId;
  readonly source: AlarmSource;
  readonly condition: AlarmCondition;
  readonly severity: AlarmSeverityId;
  readonly message?: string;
  readonly enabled?: boolean;
  readonly acknowledgmentRequired?: boolean;
  readonly visual?: AlarmVisualRule;
}
export interface AlarmSeverityDefinition {
  readonly id: AlarmSeverityId;
  readonly rank: number;
  readonly displayName: string;
}
export type AlarmLifecycleState = "inactive" | "active" | "returned-to-normal" | "disabled";
export type AlarmAcknowledgmentState = "not-required" | "unacknowledged" | "acknowledged";
export type AlarmShelvingState = "not-shelved" | "shelved" | "shelved-until";
export interface AlarmState {
  readonly alarmId: AlarmId;
  readonly lifecycle: AlarmLifecycleState;
  readonly severity: AlarmSeverityId;
  readonly active: boolean;
  readonly acknowledgment: AlarmAcknowledgmentState;
  readonly shelving: AlarmShelvingState;
  readonly activatedAt?: number;
  readonly returnedToNormalAt?: number;
  readonly acknowledgedAt?: number;
  readonly shelvedUntil?: number;
  readonly message?: string;
  readonly sourceValue?: unknown;
  readonly quality?: DataQuality;
  readonly revision: number;
}
export interface AlarmOccurrence {
  readonly occurrenceId: string;
  readonly alarmId: AlarmId;
  readonly activatedAt: number;
  readonly returnedToNormalAt?: number;
  readonly acknowledgedAt?: number;
  readonly severity: AlarmSeverityId;
  readonly message?: string;
}
export interface AcknowledgeAlarmCommand {
  readonly alarmId: AlarmId;
  readonly acknowledgedAt: number;
  readonly actorId?: string;
  readonly comment?: string;
}

export type AlarmVisualEmphasis = "none" | "subtle" | "moderate" | "strong" | "critical";
export type AlarmOverlayKind =
  | "none"
  | "badge"
  | "border"
  | "corner-indicator"
  | "icon"
  | "label"
  | "pattern";
export type AlarmIndicatorKind = "none" | "icon" | "badge" | "label" | "pattern";
export type AlarmAcknowledgedStyle = "preserve" | "deemphasize" | "static";
export interface AlarmAnimationReference {
  readonly definitionId: string;
  readonly reducedMotion?: ReducedMotionPolicy;
}
export interface AlarmVisualRule {
  readonly severity: AlarmSeverityId;
  readonly emphasis?: AlarmVisualEmphasis;
  readonly overlay?: AlarmOverlayKind;
  readonly indicator?: AlarmIndicatorKind;
  readonly animation?: AlarmAnimationReference;
  readonly acknowledgedStyle?: AlarmAcknowledgedStyle;
  readonly reducedMotionFallback?: {
    readonly emphasis: AlarmVisualEmphasis;
    readonly overlay: Exclude<AlarmOverlayKind, "none">;
    readonly indicator: Exclude<AlarmIndicatorKind, "none">;
  };
  readonly colorToken?: string;
  readonly borderToken?: string;
  readonly iconToken?: string;
}
export interface AlarmAccessibilityState {
  readonly label: string;
  readonly description?: string;
  readonly liveRegionPriority?: "off" | "polite" | "assertive";
}
export interface AlarmVisualState {
  readonly alarmId?: AlarmId;
  readonly active: boolean;
  readonly severity?: AlarmSeverityId;
  readonly acknowledged?: boolean;
  readonly shelved?: boolean;
  readonly emphasis?: AlarmVisualEmphasis;
  readonly indicator?: AlarmIndicatorKind;
  readonly overlay?: AlarmOverlayKind;
  readonly colorToken?: string;
  readonly borderToken?: string;
  readonly iconToken?: string;
  readonly animationDefinitionId?: string;
  readonly message?: string;
  readonly timestamp?: number;
}
export interface ResolvedEntityAlarmState {
  readonly primary?: AlarmState;
  readonly alarms: readonly AlarmState[];
}
export interface AlarmPriorityResolver {
  resolve(alarms: readonly AlarmState[]): ResolvedEntityAlarmState;
}
export interface AlarmSeverityRegistry {
  register(definition: AlarmSeverityDefinition): void;
  get(id: AlarmSeverityId): AlarmSeverityDefinition | undefined;
  rank(id: AlarmSeverityId): number | undefined;
  list(): readonly AlarmSeverityDefinition[];
}
export interface ResolvedPhase10VisualState {
  readonly entityId: string;
  readonly revision: number;
  readonly alarm?: AlarmVisualState;
  readonly animation?: AnimationVisualState;
  readonly accessibility?: AlarmAccessibilityState;
  readonly diagnostics?: readonly Phase10Diagnostic[];
}
export interface RuntimeAlarmInput {
  readonly sourceId: string;
  readonly entityId?: string;
  readonly value: unknown;
  readonly quality: DataQuality;
  readonly timestamp: number;
  readonly revision: number;
}
export interface AlarmVisualAuthoringMetadata {
  readonly severityOptions: readonly AlarmSeverityDefinition[];
  readonly overlayOptions: readonly {
    readonly id: AlarmOverlayKind;
    readonly displayName: string;
  }[];
}
export type AlarmDiagnostic = Phase10Diagnostic;
export type AlarmValidationResult<T> = ValidationResult<T>;
