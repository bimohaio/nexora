import { isJsonValue, type JsonValue } from "@web-scada/core";
import type { BindingDiagnostic } from "./contracts.js";

export type MappingInput = string | number | boolean | null;
export type UnmatchedMappingPolicy = "unresolved" | "passthrough" | "use-default";

export interface ValueMappingRule {
  readonly id?: string;
  readonly input: MappingInput;
  readonly output: JsonValue;
  readonly enabled?: boolean;
}

export interface ValueMappingDefinition {
  readonly type: "exact-value";
  readonly rules: readonly ValueMappingRule[];
  readonly defaultValue?: JsonValue;
  readonly unmatchedPolicy?: UnmatchedMappingPolicy;
}

export interface MappingLimits {
  readonly maximumMappingRules: number;
}

export const DEFAULT_MAPPING_LIMITS: Readonly<MappingLimits> = Object.freeze({
  maximumMappingRules: 1024
});

export type MappingEvaluationResult =
  | {
      readonly status: "matched" | "default" | "passthrough";
      readonly value: JsonValue;
      readonly ruleId?: string;
      readonly diagnostics: readonly BindingDiagnostic[];
    }
  | {
      readonly status: "unmatched" | "invalid";
      readonly diagnostics: readonly BindingDiagnostic[];
    };

export interface CompiledValueMapping {
  readonly definition: ValueMappingDefinition;
}
export type ValueMappingCompileResult =
  | { readonly success: true; readonly compiled: CompiledValueMapping }
  | { readonly success: false; readonly diagnostics: readonly BindingDiagnostic[] };

const compiledLookups = new WeakMap<CompiledValueMapping, ReadonlyMap<string, ValueMappingRule>>();

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  path?: string
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    ...(path === undefined ? {} : { path }),
    recoverable: true
  });
}

function key(value: MappingInput): string {
  if (value === null) return "null:";
  if (typeof value === "number") return `number:${Object.is(value, -0) ? 0 : value}`;
  return `${typeof value}:${String(value)}`;
}

function isInput(value: unknown): value is MappingInput {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function validateValueMapping(
  definition: Readonly<ValueMappingDefinition>,
  limits: Readonly<MappingLimits> = DEFAULT_MAPPING_LIMITS
): readonly BindingDiagnostic[] {
  const diagnostics: BindingDiagnostic[] = [];
  if (!Array.isArray(definition.rules))
    return Object.freeze([
      diagnostic("BINDING_MAPPING_INVALID_DEFINITION", "Invalid exact-value mapping definition.")
    ]);
  if (definition.rules.length > limits.maximumMappingRules)
    diagnostics.push(
      diagnostic(
        "BINDING_MAPPING_RULE_LIMIT_EXCEEDED",
        `Mapping exceeds the ${limits.maximumMappingRules} rule limit.`,
        "/rules"
      )
    );
  if (
    definition.unmatchedPolicy !== undefined &&
    !["unresolved", "passthrough", "use-default"].includes(definition.unmatchedPolicy)
  )
    diagnostics.push(
      diagnostic(
        "BINDING_MAPPING_INVALID_DEFINITION",
        "Unsupported unmatched mapping policy.",
        "/unmatchedPolicy"
      )
    );
  if (definition.unmatchedPolicy === "use-default" && definition.defaultValue === undefined)
    diagnostics.push(
      diagnostic(
        "BINDING_MAPPING_INVALID_DEFINITION",
        "The use-default policy requires defaultValue.",
        "/defaultValue"
      )
    );
  if (definition.defaultValue !== undefined && !isJsonValue(definition.defaultValue))
    diagnostics.push(
      diagnostic("BINDING_MAPPING_INVALID_OUTPUT", "Mapping default must be JSON-safe.")
    );
  const seen = new Set<string>();
  const rules: readonly unknown[] = definition.rules;
  rules.forEach((candidate, index) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      diagnostics.push(
        diagnostic(
          "BINDING_MAPPING_INVALID_DEFINITION",
          "Each mapping rule must be an object.",
          `/rules/${index}`
        )
      );
      return;
    }
    const rule = candidate as Readonly<Record<string, unknown>>;
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean")
      diagnostics.push(
        diagnostic(
          "BINDING_MAPPING_INVALID_DEFINITION",
          "Rule enabled must be boolean.",
          `/rules/${index}/enabled`
        )
      );
    if (!isInput(rule.input))
      diagnostics.push(
        diagnostic(
          "BINDING_MAPPING_INVALID_INPUT",
          "Rule input must be a primitive with finite numbers.",
          `/rules/${index}/input`
        )
      );
    if (!isJsonValue(rule.output))
      diagnostics.push(
        diagnostic(
          "BINDING_MAPPING_INVALID_OUTPUT",
          "Rule output must be JSON-safe.",
          `/rules/${index}/output`
        )
      );
    if (rule.enabled === false || !isInput(rule.input)) return;
    const encoded = key(rule.input);
    if (seen.has(encoded))
      diagnostics.push(
        diagnostic(
          "BINDING_MAPPING_DUPLICATE_INPUT",
          "Enabled mapping rules must have unique typed inputs.",
          `/rules/${index}/input`
        )
      );
    seen.add(encoded);
  });
  return Object.freeze(diagnostics);
}

export function compileValueMapping(
  definition: Readonly<ValueMappingDefinition>,
  limits: Readonly<MappingLimits> = DEFAULT_MAPPING_LIMITS
): ValueMappingCompileResult {
  const diagnostics = validateValueMapping(definition, limits);
  if (diagnostics.length > 0) return Object.freeze({ success: false, diagnostics });
  const lookup = new Map<string, ValueMappingRule>();
  for (const rule of definition.rules) {
    if (rule.enabled === false) continue;
    lookup.set(key(rule.input), Object.freeze({ ...rule }));
  }
  const compiled: CompiledValueMapping = Object.freeze({
    definition: Object.freeze({
      ...definition,
      rules: Object.freeze(definition.rules.map((rule) => Object.freeze({ ...rule })))
    })
  });
  compiledLookups.set(compiled, lookup);
  return Object.freeze({
    success: true,
    compiled
  });
}

export function evaluateValueMapping(
  value: JsonValue,
  definition: Readonly<ValueMappingDefinition>,
  limits: Readonly<MappingLimits> = DEFAULT_MAPPING_LIMITS
): MappingEvaluationResult {
  try {
    const compiled = compileValueMapping(definition, limits);
    if (!compiled.success)
      return Object.freeze({ status: "invalid", diagnostics: compiled.diagnostics });
    if (isInput(value)) {
      const rule = compiledLookups.get(compiled.compiled)?.get(key(value));
      if (rule !== undefined)
        return Object.freeze({
          status: "matched",
          value: rule.output,
          ...(rule.id === undefined ? {} : { ruleId: rule.id }),
          diagnostics: Object.freeze([])
        });
    }
    if (definition.defaultValue !== undefined)
      return Object.freeze({
        status: "default",
        value: definition.defaultValue,
        diagnostics: Object.freeze([
          Object.freeze({
            ...diagnostic("BINDING_MAPPING_DEFAULT_USED", "Mapping default was used."),
            severity: "info" as const
          })
        ])
      });
    if (definition.unmatchedPolicy === "passthrough")
      return Object.freeze({
        status: "passthrough",
        value,
        diagnostics: Object.freeze([
          Object.freeze({
            ...diagnostic("BINDING_MAPPING_PASSTHROUGH_USED", "Mapping passthrough was used."),
            severity: "info" as const
          })
        ])
      });
    return Object.freeze({
      status: "unmatched",
      diagnostics: Object.freeze([
        diagnostic("BINDING_MAPPING_NO_MATCH", "No enabled mapping rule matched the source value.")
      ])
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      diagnostics: Object.freeze([
        diagnostic("BINDING_MAPPING_EVALUATION_ERROR", "Mapping evaluation failed unexpectedly.")
      ])
    });
  }
}
