import type { BindingSource, BindingTarget, JsonValue, PropertyBinding } from "@web-scada/core";

/** Persisted binding data remains owned by Core. */
export type BindingDefinition = PropertyBinding;
export type BindingSourceDefinition = BindingSource;
export type BindingTargetDefinition = BindingTarget;

export type BindingOwnerReference =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "canvas"; readonly documentId: string }
  | { readonly kind: "layer"; readonly layerId: string }
  | { readonly kind: "node"; readonly nodeId: string }
  | { readonly kind: "connection"; readonly connectionId: string }
  | {
      readonly kind: "extension";
      readonly namespace: string;
      readonly entityId: string;
    };

export type BindingEvaluationStatus =
  "resolved" | "fallback" | "disabled" | "unresolved" | "invalid" | "error";

export type ResolvedBindingValue = JsonValue;

export interface BindingEvaluationResult {
  readonly bindingId: string;
  readonly status: BindingEvaluationStatus;
  readonly target: BindingTargetDefinition;
  readonly value?: ResolvedBindingValue;
  readonly dependencies: readonly BindingDependency[];
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly revision?: number;
}

export type BindingDependency =
  | { readonly kind: "runtime-value"; readonly key: string }
  | { readonly kind: "binding"; readonly bindingId: string }
  | {
      readonly kind: "document-property";
      readonly owner: BindingOwnerReference;
      readonly propertyKey: string;
    }
  | { readonly kind: "environment"; readonly key: string };

export type BindingDiagnosticSeverity = "info" | "warning" | "error";

export const BINDING_DIAGNOSTIC_CODES = [
  "BINDING_INVALID_DEFINITION",
  "BINDING_DUPLICATE_ID",
  "BINDING_UNKNOWN_TYPE",
  "BINDING_OWNER_NOT_FOUND",
  "BINDING_REFERENCE_NOT_FOUND",
  "BINDING_SELF_REFERENCE",
  "BINDING_INVALID_FALLBACK",
  "BINDING_DIRECT_DISABLED",
  "BINDING_RUNTIME_KEY_EMPTY",
  "BINDING_RUNTIME_VALUE_MISSING",
  "BINDING_RUNTIME_VALUE_BAD_QUALITY",
  "BINDING_RUNTIME_VALUE_STALE",
  "BINDING_RUNTIME_VALUE_INVALID",
  "BINDING_TARGET_TYPE_MISMATCH",
  "BINDING_FALLBACK_USED",
  "BINDING_DIRECT_EVALUATION_ERROR",
  "EXPRESSION_SOURCE_TOO_LONG",
  "EXPRESSION_INVALID_CHARACTER",
  "EXPRESSION_INVALID_NUMBER",
  "EXPRESSION_UNTERMINATED_STRING",
  "EXPRESSION_INVALID_ESCAPE",
  "EXPRESSION_STRING_LIMIT_EXCEEDED",
  "EXPRESSION_TOKEN_LIMIT_EXCEEDED",
  "EXPRESSION_UNEXPECTED_TOKEN",
  "EXPRESSION_EXPECTED_EXPRESSION",
  "EXPRESSION_EXPECTED_RIGHT_PAREN",
  "EXPRESSION_EXPECTED_COLON",
  "EXPRESSION_NESTING_LIMIT_EXCEEDED",
  "EXPRESSION_AST_LIMIT_EXCEEDED",
  "EXPRESSION_UNSUPPORTED_LANGUAGE",
  "EXPRESSION_UNKNOWN_IDENTIFIER",
  "EXPRESSION_UNKNOWN_FUNCTION",
  "EXPRESSION_INVALID_FUNCTION_ARITY",
  "EXPRESSION_INVALID_RUNTIME_REFERENCE",
  "EXPRESSION_DEPENDENCY_LIMIT_EXCEEDED",
  "EXPRESSION_RUNTIME_VALUE_MISSING",
  "EXPRESSION_RUNTIME_VALUE_BAD_QUALITY",
  "EXPRESSION_TYPE_MISMATCH",
  "EXPRESSION_DIVISION_BY_ZERO",
  "EXPRESSION_REMAINDER_BY_ZERO",
  "EXPRESSION_NON_FINITE_RESULT",
  "EXPRESSION_EVALUATION_LIMIT_EXCEEDED",
  "EXPRESSION_FUNCTION_ERROR",
  "EXPRESSION_TARGET_TYPE_MISMATCH",
  "EXPRESSION_FALLBACK_USED",
  "EXPRESSION_EVALUATION_ERROR",
  "BINDING_MAPPING_INVALID_DEFINITION",
  "BINDING_MAPPING_RULE_LIMIT_EXCEEDED",
  "BINDING_MAPPING_DUPLICATE_INPUT",
  "BINDING_MAPPING_INVALID_INPUT",
  "BINDING_MAPPING_INVALID_OUTPUT",
  "BINDING_MAPPING_NO_MATCH",
  "BINDING_MAPPING_DEFAULT_USED",
  "BINDING_MAPPING_PASSTHROUGH_USED",
  "BINDING_MAPPING_EVALUATION_ERROR",
  "BINDING_FORMAT_INVALID_DEFINITION",
  "BINDING_FORMAT_UNSUPPORTED_TYPE",
  "BINDING_FORMAT_INPUT_TYPE_MISMATCH",
  "BINDING_FORMAT_INVALID_DIGIT_RANGE",
  "BINDING_FORMAT_NON_FINITE_NUMBER",
  "BINDING_FORMAT_PREFIX_TOO_LONG",
  "BINDING_FORMAT_SUFFIX_TOO_LONG",
  "BINDING_FORMAT_UNIT_TOO_LONG",
  "BINDING_FORMAT_OUTPUT_TOO_LONG",
  "BINDING_FORMAT_NULL_VALUE",
  "BINDING_FORMAT_EVALUATION_ERROR",
  "BINDING_TRANSFORM_TARGET_TYPE_MISMATCH",
  "BINDING_TRANSFORM_FALLBACK_USED",
  "THRESHOLD_INVALID_DEFINITION",
  "THRESHOLD_DUPLICATE_RULE_ID",
  "THRESHOLD_UNKNOWN_OPERATOR",
  "THRESHOLD_MISSING_VALUE",
  "THRESHOLD_INVALID_TYPE",
  "THRESHOLD_INVALID_COMPARISON",
  "THRESHOLD_INVALID_RANGE",
  "THRESHOLD_INVALID_REGEX",
  "THRESHOLD_PRIORITY_CONFLICT",
  "THRESHOLD_INVALID_OUTPUT",
  "THRESHOLD_MISSING_FALLBACK",
  "THRESHOLD_EXPRESSION_ERROR",
  "THRESHOLD_NO_MATCH",
  "THRESHOLD_FALLBACK_USED",
  "UNKNOWN_VISUAL_PROPERTY",
  "UNSUPPORTED_VISUAL_TARGET",
  "INVALID_VISUAL_TARGET",
  "UNSAFE_VISUAL_TARGET",
  "INVALID_VISUAL_PROPERTY_TYPE",
  "INVALID_VISUAL_PROPERTY_RANGE",
  "NULL_VISUAL_PROPERTY_NOT_ALLOWED",
  "NON_FINITE_VISUAL_NUMBER",
  "UNSAFE_VISUAL_COLOR",
  "CONFLICTING_VISUAL_BINDINGS",
  "VISUAL_PROPERTY_UNRESOLVED",
  "BINDING_DEPENDENCY_INVALID_KEY",
  "BINDING_DEPENDENCY_UNRESOLVED",
  "BINDING_DEPENDENCY_CYCLE",
  "BINDING_GRAPH_LIMIT_EXCEEDED",
  "BINDING_PLAN_STALE_GRAPH",
  "BINDING_INCREMENTAL_EVALUATION_FAILED",
  "BINDING_REVISION_OUT_OF_ORDER",
  "BINDING_COORDINATOR_INVALID_REQUEST",
  "BINDING_COORDINATOR_SCHEDULING_FAILED",
  "BINDING_COORDINATOR_CANCEL_FAILED",
  "BINDING_COORDINATOR_DRAIN_LIMIT",
  "BINDING_EXECUTION_SUPERSEDED",
  "BINDING_CACHE_OPERATION_FAILED",
  "BINDING_ENGINE_DISPOSED"
] as const;

export type BindingDiagnosticCode = (typeof BINDING_DIAGNOSTIC_CODES)[number];

export interface BindingDiagnostic {
  readonly code: BindingDiagnosticCode;
  readonly severity: BindingDiagnosticSeverity;
  readonly message: string;
  readonly bindingId?: string;
  readonly owner?: BindingOwnerReference;
  readonly path?: string;
  readonly recoverable: boolean;
  readonly context?: Readonly<Record<string, JsonValue>>;
  /** Zero-based half-open offsets into expression source. */
  readonly sourceRange?: { readonly start: number; readonly end: number };
}
