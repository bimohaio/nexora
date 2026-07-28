import { isJsonValue, type JsonValue, type PropertyBinding } from "@web-scada/core";
import type { DataQuality, RuntimeDataPoint, RuntimeSnapshot } from "@web-scada/runtime-engine";
import type {
  BindingDependency,
  BindingDiagnostic,
  BindingEvaluationResult,
  BindingTargetDefinition
} from "./contracts.js";
import { getBindingOwner } from "./validation.js";
import type { BindingTypeRegistry } from "./registry.js";

export type DirectBindingDefinition = PropertyBinding & {
  readonly source: Extract<PropertyBinding["source"], { readonly type: "tag" }>;
};

export interface RuntimeBindingValueReader {
  readonly revision?: number;
  readonly timestamp?: number;
  get(key: string): RuntimeDataPoint | undefined;
}

export interface DirectBindingEvaluationPolicies {
  /** `good` and `uncertain` are always usable. Other qualities default to rejected. */
  readonly rejectedQuality?: "reject" | "accept";
  /** Reject values older than this duration. Omit to disable age-based rejection. */
  readonly maximumAgeMs?: number;
  /** Defaults to true to preserve the existing runtime fallback behavior. */
  readonly fallbackOnTypeMismatch?: boolean;
  /** Internal composition hook: transform the raw value before target validation. */
  readonly deferTargetValidation?: boolean;
}

export interface DirectBindingEvaluationContext {
  readonly runtime: RuntimeBindingValueReader | RuntimeSnapshot;
  /** Deterministic evaluation time. Defaults to the snapshot timestamp. */
  readonly timestamp?: number;
  readonly policies?: Readonly<DirectBindingEvaluationPolicies>;
}

export interface DirectBindingSourceMetadata {
  readonly key: string;
  readonly quality?: DataQuality;
  readonly timestamp?: number;
  readonly runtimeRevision?: number;
}

export interface DirectBindingEvaluationResult extends BindingEvaluationResult {
  readonly bindingType: "direct";
  readonly source: DirectBindingSourceMetadata;
}

const BOOLEAN_PROPERTIES = new Set([
  "active",
  "running",
  "open",
  "enabled",
  "disabled",
  "offline",
  "warning",
  "alarm",
  "visible"
]);
const NUMBER_PROPERTIES = new Set([
  "level",
  "speed",
  "flow",
  "opacity",
  "rotation",
  "scale",
  "scaleX",
  "scaleY",
  "numeric-value",
  "strokeWidth"
]);
const STRING_PROPERTIES = new Set(["text", "color", "status", "direction", "stroke"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneJson));
  const record = value as Readonly<Record<string, JsonValue>>;
  const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(record).sort()) {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError("Unsafe runtime value key.");
    output[key] = cloneJson(record[key] as JsonValue);
  }
  return Object.freeze(output);
}

function propertyKind(property: string): "boolean" | "number" | "string" | "json" {
  if (BOOLEAN_PROPERTIES.has(property)) return "boolean";
  if (NUMBER_PROPERTIES.has(property)) return "number";
  if (STRING_PROPERTIES.has(property)) return "string";
  return "json";
}

function targetKind(
  target: BindingTargetDefinition
): "boolean" | "number" | "string" | "json" | "connection-style" {
  switch (target.type) {
    case "visibility":
      return "boolean";
    case "text":
      return "string";
    case "node-state":
      return "string";
    case "node-property":
      return propertyKind(target.property);
    case "connection-property":
      return "connection-style";
  }
}

export function isBindingTargetValueCompatible(
  target: BindingTargetDefinition,
  value: unknown
): boolean {
  if (!isJsonValue(value)) return false;
  const kind = targetKind(target);
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (kind === "string") return typeof value === "string";
  if (kind === "json") return true;
  const property = target.type === "connection-property" ? target.property : "";
  if (property === "stroke") return typeof value === "string";
  if (property === "strokeWidth" || property === "opacity")
    return typeof value === "number" && Number.isFinite(value);
  if (property === "dashPattern")
    return (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    );
  if (property === "lineCap")
    return typeof value === "string" && ["butt", "round", "square"].includes(value);
  if (property === "lineJoin")
    return typeof value === "string" && ["miter", "round", "bevel"].includes(value);
  if (property === "startMarker" || property === "endMarker")
    return typeof value === "string" && ["none", "arrow", "circle", "diamond"].includes(value);
  return false;
}

function dependency(key: string): readonly BindingDependency[] {
  return Object.freeze([Object.freeze({ kind: "runtime-value" as const, key })]);
}

function diagnostic(
  definition: Readonly<DirectBindingDefinition>,
  code: BindingDiagnostic["code"],
  message: string,
  severity: BindingDiagnostic["severity"] = "warning",
  context: Readonly<Record<string, JsonValue>> = {}
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity,
    message,
    bindingId: definition.id,
    owner: getBindingOwner(definition),
    recoverable: true,
    context: Object.freeze({ ...context })
  });
}

function result(
  definition: Readonly<DirectBindingDefinition>,
  status: DirectBindingEvaluationResult["status"],
  source: DirectBindingSourceMetadata,
  dependencies: readonly BindingDependency[],
  diagnostics: readonly BindingDiagnostic[],
  value?: JsonValue
): DirectBindingEvaluationResult {
  return Object.freeze({
    bindingId: definition.id,
    bindingType: "direct",
    status,
    target: Object.freeze({ ...definition.target }),
    source: Object.freeze({ ...source }),
    dependencies,
    diagnostics: Object.freeze([...diagnostics]),
    ...(source.runtimeRevision === undefined ? {} : { revision: source.runtimeRevision }),
    ...(value === undefined ? {} : { value: cloneJson(value) })
  });
}

function fallback(
  definition: Readonly<DirectBindingDefinition>,
  source: DirectBindingSourceMetadata,
  dependencies: readonly BindingDependency[],
  reason: BindingDiagnostic,
  withoutFallback: "unresolved" | "invalid" = "unresolved"
): DirectBindingEvaluationResult {
  if (definition.fallback === undefined)
    return result(definition, withoutFallback, source, dependencies, [reason]);
  if (!isBindingTargetValueCompatible(definition.target, definition.fallback))
    return result(definition, "invalid", source, dependencies, [
      reason,
      diagnostic(
        definition,
        "BINDING_INVALID_FALLBACK",
        "The explicit fallback is not compatible with the binding target.",
        "error",
        { fallbackType: definition.fallback === null ? "null" : typeof definition.fallback }
      )
    ]);
  return result(
    definition,
    "fallback",
    source,
    dependencies,
    [
      reason,
      diagnostic(definition, "BINDING_FALLBACK_USED", "The explicit fallback value was used.")
    ],
    definition.fallback
  );
}

export function getDirectBindingDependencies(
  definition: Readonly<DirectBindingDefinition>
): readonly BindingDependency[] {
  const key = definition.source.tagId.trim();
  return key === "" ? Object.freeze([]) : dependency(key);
}

export function evaluateDirectBinding(
  definition: Readonly<DirectBindingDefinition>,
  context: Readonly<DirectBindingEvaluationContext>
): DirectBindingEvaluationResult {
  const key = definition.source.tagId.trim();
  const dependencies = key === "" ? Object.freeze([]) : dependency(key);
  const initialSource = {
    key,
    ...(context.runtime.revision === undefined ? {} : { runtimeRevision: context.runtime.revision })
  };
  if (!definition.enabled)
    return result(definition, "disabled", initialSource, dependencies, [
      diagnostic(definition, "BINDING_DIRECT_DISABLED", "The direct binding is disabled.", "info")
    ]);
  if (key === "")
    return result(definition, "invalid", initialSource, dependencies, [
      diagnostic(
        definition,
        "BINDING_RUNTIME_KEY_EMPTY",
        "A direct binding requires a non-empty runtime key.",
        "error"
      )
    ]);
  try {
    const point = context.runtime.get(key);
    if (point === undefined)
      return fallback(
        definition,
        initialSource,
        dependencies,
        diagnostic(
          definition,
          "BINDING_RUNTIME_VALUE_MISSING",
          "The runtime value is not available.",
          "warning",
          { runtimeKey: key }
        )
      );
    const source = {
      ...initialSource,
      quality: point.quality,
      timestamp: point.timestamp
    };
    const rejectedQuality =
      !["good", "uncertain"].includes(point.quality) &&
      context.policies?.rejectedQuality !== "accept";
    if (rejectedQuality)
      return fallback(
        definition,
        source,
        dependencies,
        diagnostic(
          definition,
          "BINDING_RUNTIME_VALUE_BAD_QUALITY",
          "The runtime quality is rejected by the direct binding policy.",
          "warning",
          { quality: point.quality, runtimeKey: key }
        )
      );
    const maximumAgeMs = context.policies?.maximumAgeMs;
    const evaluationTime = context.timestamp ?? context.runtime.timestamp;
    if (
      maximumAgeMs !== undefined &&
      evaluationTime !== undefined &&
      evaluationTime - point.timestamp > maximumAgeMs
    )
      return fallback(
        definition,
        source,
        dependencies,
        diagnostic(
          definition,
          "BINDING_RUNTIME_VALUE_STALE",
          "The runtime value exceeds the configured maximum age.",
          "warning",
          { maximumAgeMs, runtimeKey: key, timestamp: point.timestamp }
        )
      );
    if (
      context.policies?.deferTargetValidation !== true &&
      !isBindingTargetValueCompatible(definition.target, point.value)
    ) {
      const mismatch = diagnostic(
        definition,
        "BINDING_TARGET_TYPE_MISMATCH",
        "The runtime value is not compatible with the binding target.",
        "error",
        { runtimeKey: key, valueType: point.value === null ? "null" : typeof point.value }
      );
      if (context.policies?.fallbackOnTypeMismatch === false)
        return result(definition, "invalid", source, dependencies, [mismatch]);
      return fallback(definition, source, dependencies, mismatch, "invalid");
    }
    return result(definition, "resolved", source, dependencies, [], point.value);
  } catch {
    return result(definition, "error", initialSource, dependencies, [
      diagnostic(
        definition,
        "BINDING_DIRECT_EVALUATION_ERROR",
        "Direct binding evaluation failed unexpectedly.",
        "error",
        { runtimeKey: key }
      )
    ]);
  }
}

export function evaluateDirectBindings(
  definitions: readonly Readonly<DirectBindingDefinition>[],
  context: Readonly<DirectBindingEvaluationContext>
): readonly DirectBindingEvaluationResult[] {
  return Object.freeze(definitions.map((definition) => evaluateDirectBinding(definition, context)));
}

export function registerDirectBindingType(registry: BindingTypeRegistry): void {
  registry.register({
    type: "direct",
    aliases: ["tag"],
    getDependencies: (definition) =>
      definition.source.type === "tag"
        ? getDirectBindingDependencies(definition as DirectBindingDefinition)
        : Object.freeze([])
  });
}
