import type { JsonValue, PropertyBinding } from "@web-scada/core";
import type {
  BindingDiagnostic,
  BindingEvaluationResult,
  BindingEvaluationStatus
} from "./contracts.js";
import { isBindingTargetValueCompatible } from "./direct.js";
import {
  formatBindingValue,
  type FormattingContext,
  type ValueFormatDefinition
} from "./formatting.js";
import {
  evaluateValueMapping,
  type MappingLimits,
  type ValueMappingDefinition
} from "./mapping.js";

export interface BindingTransformContext extends FormattingContext {
  readonly mappingLimits?: Readonly<MappingLimits>;
}

export interface BindingTransformResult {
  readonly status: BindingEvaluationStatus;
  readonly value?: JsonValue;
  readonly diagnostics: readonly BindingDiagnostic[];
}

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  definition: Readonly<PropertyBinding>
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    bindingId: definition.id,
    recoverable: true
  });
}

function finalResult(
  definition: Readonly<PropertyBinding>,
  status: BindingEvaluationStatus,
  diagnostics: readonly BindingDiagnostic[],
  value?: JsonValue
): BindingTransformResult {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    ...(value === undefined ? {} : { value })
  });
}

function useFallback(
  definition: Readonly<PropertyBinding>,
  diagnostics: readonly BindingDiagnostic[]
): BindingTransformResult {
  if (definition.fallback === undefined) return finalResult(definition, "invalid", diagnostics);
  if (!isBindingTargetValueCompatible(definition.target, definition.fallback))
    return finalResult(definition, "invalid", [
      ...diagnostics,
      diagnostic(
        "BINDING_INVALID_FALLBACK",
        "The explicit fallback is not compatible with the binding target.",
        definition
      )
    ]);
  return finalResult(
    definition,
    "fallback",
    [
      ...diagnostics,
      diagnostic(
        "BINDING_TRANSFORM_FALLBACK_USED",
        "The final, untransformed binding fallback was used.",
        definition
      )
    ],
    definition.fallback
  );
}

/**
 * Applies Core's canonical persisted order: transformation, formatter, target validation.
 * The caller supplies an already-resolved source value, so it is never read twice.
 */
export function applyBindingTransforms(
  value: JsonValue,
  definition: Readonly<PropertyBinding>,
  context: Readonly<BindingTransformContext>
): BindingTransformResult {
  let current = value;
  const diagnostics: BindingDiagnostic[] = [];
  if (definition.transformation !== undefined) {
    if (definition.transformation.type !== "exact-value")
      return useFallback(definition, [
        diagnostic(
          "BINDING_MAPPING_INVALID_DEFINITION",
          "Only the exact-value transformation is supported.",
          definition
        )
      ]);
    const options = definition.transformation.options as unknown as ValueMappingDefinition;
    const mapped = evaluateValueMapping(
      current,
      { ...options, type: "exact-value" },
      context.mappingLimits
    );
    diagnostics.push(...mapped.diagnostics);
    if (!("value" in mapped)) return useFallback(definition, diagnostics);
    current = mapped.value;
  }
  if (definition.formatter !== undefined) {
    const options = definition.formatter.options as unknown as Omit<ValueFormatDefinition, "type">;
    const formatted = formatBindingValue(
      current,
      { ...options, type: definition.formatter.type } as ValueFormatDefinition,
      context
    );
    diagnostics.push(...formatted.diagnostics);
    if (!("value" in formatted)) return useFallback(definition, diagnostics);
    current = formatted.value;
  }
  if (!isBindingTargetValueCompatible(definition.target, current))
    return useFallback(definition, [
      ...diagnostics,
      diagnostic(
        "BINDING_TRANSFORM_TARGET_TYPE_MISMATCH",
        "The transformed value is not compatible with the binding target.",
        definition
      )
    ]);
  return finalResult(definition, "resolved", diagnostics, current);
}

/** Preserves source dependencies, revision, and diagnostics at the public result boundary. */
export function transformBindingEvaluationResult(
  source: Readonly<BindingEvaluationResult>,
  definition: Readonly<PropertyBinding>,
  context: Readonly<BindingTransformContext>
): BindingEvaluationResult {
  if (source.status !== "resolved" || source.value === undefined) return source;
  const transformed = applyBindingTransforms(source.value, definition, context);
  return Object.freeze({
    bindingId: source.bindingId,
    status: transformed.status,
    target: Object.freeze({ ...definition.target }),
    dependencies: source.dependencies,
    diagnostics: Object.freeze([...source.diagnostics, ...transformed.diagnostics]),
    ...(source.revision === undefined ? {} : { revision: source.revision }),
    ...(transformed.value === undefined ? {} : { value: transformed.value })
  });
}

export interface BindingTransformTypeDefinition {
  readonly type: string;
  readonly kind: "mapping" | "formatting";
}
export class DuplicateBindingTransformTypeError extends Error {}
export class BindingTransformTypeRegistry {
  readonly #definitions = new Map<string, BindingTransformTypeDefinition>();
  public register(definition: Readonly<BindingTransformTypeDefinition>): void {
    const type = definition.type.trim();
    if (type === "") throw new TypeError("Transform type must be non-empty.");
    if (this.#definitions.has(type)) throw new DuplicateBindingTransformTypeError(type);
    this.#definitions.set(type, Object.freeze({ ...definition, type }));
  }
  public get(type: string): BindingTransformTypeDefinition | undefined {
    return this.#definitions.get(type);
  }
  public list(): readonly BindingTransformTypeDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort((left, right) => left.type.localeCompare(right.type))
    );
  }
}
export function registerMappingTransformType(registry: BindingTransformTypeRegistry): void {
  registry.register({ type: "exact-value", kind: "mapping" });
}
export function registerFormattingTransformTypes(registry: BindingTransformTypeRegistry): void {
  for (const type of ["boolean", "identity", "number", "text"])
    registry.register({ type, kind: "formatting" });
}
