import { isJsonValue, type JsonValue } from "@web-scada/core";
import type { DataQuality, RuntimeSnapshot } from "@web-scada/runtime-engine";
import {
  compileExpression,
  evaluateExpression,
  type CompiledExpression,
  type ExpressionFunctionRegistry
} from "./expression.js";
import { getBindingDependencyKey, normalizeBindingDependencies } from "./dependencies.js";
import type { BindingDependency, BindingDiagnostic } from "./contracts.js";

export const THRESHOLD_SCHEMA_VERSION = 1 as const;

export type ThresholdOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "betweenExclusive"
  | "betweenLeftExclusive"
  | "betweenRightExclusive"
  | "true"
  | "false"
  | "isNull"
  | "isNotNull"
  | "isEmpty"
  | "isNotEmpty"
  | "equals"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "matchesRegex"
  | "oneOf"
  | "notOneOf"
  | "quality"
  | "olderThan"
  | "newerThan"
  | "within";

export type ThresholdConflictResolution =
  "FIRST_MATCH" | "LAST_MATCH" | "HIGHEST_PRIORITY" | "ALL_MATCHES";

export type ThresholdOutputKind =
  | "boolean"
  | "number"
  | "string"
  | "color"
  | "visibility"
  | "opacity"
  | "rotation"
  | "scale"
  | "animation-trigger"
  | "alarm-state"
  | "style-token"
  | "custom-json";

export interface ThresholdOutput {
  readonly kind: ThresholdOutputKind;
  readonly value: JsonValue;
}

export interface ThresholdRule {
  readonly id: string;
  readonly priority?: number;
  readonly operator: ThresholdOperator;
  readonly compareValue?: JsonValue;
  readonly compareValue2?: JsonValue;
  readonly output: ThresholdOutput;
  readonly enabled?: boolean;
  readonly description?: string;
}

export type Condition =
  | { readonly kind: "threshold"; readonly rule: ThresholdRule }
  | { readonly kind: "expression"; readonly expression: string }
  | { readonly kind: "and"; readonly conditions: readonly Condition[] }
  | { readonly kind: "or"; readonly conditions: readonly Condition[] }
  | { readonly kind: "not"; readonly condition: Condition };

export interface ConditionalBranch {
  readonly id: string;
  readonly condition?: Condition;
  readonly output: ThresholdOutput | ConditionalBinding;
}

export interface ConditionalBinding {
  readonly schemaVersion: typeof THRESHOLD_SCHEMA_VERSION;
  readonly id: string;
  /** Ordered IF / ELSE IF branches; the condition-less branch is ELSE. */
  readonly branches: readonly ConditionalBranch[];
  readonly fallback?: ThresholdOutput;
}

export interface ThresholdRuleSet {
  readonly schemaVersion: typeof THRESHOLD_SCHEMA_VERSION;
  readonly id: string;
  readonly rules: readonly ThresholdRule[];
  readonly conflictResolution: ThresholdConflictResolution;
  readonly fallback?: ThresholdOutput;
  readonly enabled?: boolean;
}

export interface ThresholdEvaluationContext {
  readonly value: JsonValue;
  readonly runtime?: RuntimeSnapshot;
  readonly quality?: DataQuality | "stale";
  readonly timestamp?: number;
  readonly now?: number;
  readonly variables?: Readonly<Record<string, JsonValue>>;
  readonly theme?: Readonly<Record<string, JsonValue>>;
  readonly constants?: Readonly<Record<string, JsonValue>>;
  readonly expressionFunctions?: ExpressionFunctionRegistry;
}

export interface ConditionEvaluationResult {
  readonly matched: boolean;
  readonly success: boolean;
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly dependencies: readonly BindingDependency[];
}

export interface ResolvedThresholdResult {
  readonly success: boolean;
  readonly status: "resolved" | "fallback" | "unresolved" | "invalid" | "disabled";
  readonly value?: JsonValue | readonly JsonValue[];
  readonly output?: ThresholdOutput | readonly ThresholdOutput[];
  readonly matchedRuleIds: readonly string[];
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly dependencies: readonly BindingDependency[];
}

export interface ThresholdValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly BindingDiagnostic[];
}

const OPERATORS: ReadonlySet<string> = new Set<ThresholdOperator>([
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "between",
  "betweenExclusive",
  "betweenLeftExclusive",
  "betweenRightExclusive",
  "true",
  "false",
  "isNull",
  "isNotNull",
  "isEmpty",
  "isNotEmpty",
  "equals",
  "contains",
  "startsWith",
  "endsWith",
  "matchesRegex",
  "oneOf",
  "notOneOf",
  "quality",
  "olderThan",
  "newerThan",
  "within"
]);

const OUTPUTS: ReadonlySet<string> = new Set<ThresholdOutputKind>([
  "boolean",
  "number",
  "string",
  "color",
  "visibility",
  "opacity",
  "rotation",
  "scale",
  "animation-trigger",
  "alarm-state",
  "style-token",
  "custom-json"
]);

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  path?: string,
  severity: BindingDiagnostic["severity"] = "error"
): BindingDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }), severity, recoverable: true };
}

function validateOutput(output: ThresholdOutput, path: string): readonly BindingDiagnostic[] {
  const result: BindingDiagnostic[] = [];
  if (!OUTPUTS.has(output.kind) || !isJsonValue(output.value))
    result.push(
      diagnostic("THRESHOLD_INVALID_OUTPUT", "Rule output is unsupported or not JSON-safe.", path)
    );
  if (
    (output.kind === "boolean" || output.kind === "visibility") &&
    typeof output.value !== "boolean"
  )
    result.push(
      diagnostic("THRESHOLD_INVALID_OUTPUT", `${output.kind} output must be boolean.`, path)
    );
  if (
    ["number", "opacity", "rotation", "scale"].includes(output.kind) &&
    (typeof output.value !== "number" || !Number.isFinite(output.value))
  )
    result.push(
      diagnostic("THRESHOLD_INVALID_OUTPUT", `${output.kind} output must be a finite number.`, path)
    );
  if (
    output.kind === "opacity" &&
    typeof output.value === "number" &&
    (output.value < 0 || output.value > 1)
  )
    result.push(diagnostic("THRESHOLD_INVALID_OUTPUT", "Opacity must be between 0 and 1.", path));
  return result;
}

function safeRegexSource(source: string): boolean {
  return (
    source.length <= 512 &&
    !/\\[1-9]/.test(source) &&
    !/\(\?[=!<]/.test(source) &&
    !/(?:\*|\+|\{\d+(?:,\d*)?\})(?:\s*)(?:\*|\+|\{)/.test(source) &&
    !/\([^)]*(?:\*|\+|\{\d+(?:,\d*)?\})[^)]*\)(?:\*|\+|\{)/.test(source)
  );
}

function compileSafeRegex(source: string): RegExp | undefined {
  if (!safeRegexSource(source)) return undefined;
  try {
    return new RegExp(source, "u");
  } catch {
    return undefined;
  }
}

export function validateThresholdRule(
  rule: Readonly<ThresholdRule>,
  path = ""
): ThresholdValidationResult {
  const diagnostics: BindingDiagnostic[] = [];
  if (rule.id.trim() === "")
    diagnostics.push(
      diagnostic("THRESHOLD_INVALID_DEFINITION", "Rule ID is required.", `${path}/id`)
    );
  if (!OPERATORS.has(rule.operator))
    diagnostics.push(
      diagnostic(
        "THRESHOLD_UNKNOWN_OPERATOR",
        `Unknown threshold operator: ${rule.operator}`,
        `${path}/operator`
      )
    );
  if (rule.priority !== undefined && !Number.isSafeInteger(rule.priority))
    diagnostics.push(
      diagnostic(
        "THRESHOLD_INVALID_DEFINITION",
        "Priority must be a safe integer.",
        `${path}/priority`
      )
    );
  const needsOne = [
    "==",
    "!=",
    ">",
    ">=",
    "<",
    "<=",
    "equals",
    "contains",
    "startsWith",
    "endsWith",
    "matchesRegex",
    "oneOf",
    "notOneOf",
    "quality",
    "olderThan",
    "newerThan",
    "within"
  ].includes(rule.operator);
  if (needsOne && rule.compareValue === undefined)
    diagnostics.push(
      diagnostic("THRESHOLD_MISSING_VALUE", "Comparison value is required.", `${path}/compareValue`)
    );
  if (rule.operator.startsWith("between")) {
    if (
      typeof rule.compareValue !== "number" ||
      typeof rule.compareValue2 !== "number" ||
      !Number.isFinite(rule.compareValue) ||
      !Number.isFinite(rule.compareValue2) ||
      rule.compareValue > rule.compareValue2
    )
      diagnostics.push(
        diagnostic(
          "THRESHOLD_INVALID_RANGE",
          "Between bounds must be ordered finite numbers.",
          path
        )
      );
  }
  if (
    rule.operator === "matchesRegex" &&
    (typeof rule.compareValue !== "string" || compileSafeRegex(rule.compareValue) === undefined)
  )
    diagnostics.push(
      diagnostic(
        "THRESHOLD_INVALID_REGEX",
        "Regex is invalid or uses unsafe constructs.",
        `${path}/compareValue`
      )
    );
  if (["oneOf", "notOneOf"].includes(rule.operator) && !Array.isArray(rule.compareValue))
    diagnostics.push(
      diagnostic(
        "THRESHOLD_INVALID_TYPE",
        "Enum comparison requires an array.",
        `${path}/compareValue`
      )
    );
  diagnostics.push(...validateOutput(rule.output, `${path}/output`));
  return { valid: diagnostics.length === 0, diagnostics: Object.freeze(diagnostics) };
}

export function validateThresholdRuleSet(
  set: Readonly<ThresholdRuleSet>
): ThresholdValidationResult {
  const diagnostics: BindingDiagnostic[] = [];
  const ids = new Set<string>();
  const priorities = new Set<number>();
  set.rules.forEach((rule, index) => {
    if (ids.has(rule.id))
      diagnostics.push(
        diagnostic(
          "THRESHOLD_DUPLICATE_RULE_ID",
          `Duplicate rule ID: ${rule.id}`,
          `/rules/${index}/id`
        )
      );
    ids.add(rule.id);
    if (set.conflictResolution === "HIGHEST_PRIORITY" && rule.priority !== undefined) {
      if (priorities.has(rule.priority))
        diagnostics.push(
          diagnostic(
            "THRESHOLD_PRIORITY_CONFLICT",
            `Duplicate explicit priority: ${rule.priority}`,
            `/rules/${index}/priority`,
            "warning"
          )
        );
      priorities.add(rule.priority);
    }
    diagnostics.push(...validateThresholdRule(rule, `/rules/${index}`).diagnostics);
  });
  if (set.fallback === undefined)
    diagnostics.push(
      diagnostic(
        "THRESHOLD_MISSING_FALLBACK",
        "A fallback output is recommended.",
        "/fallback",
        "warning"
      )
    );
  else diagnostics.push(...validateOutput(set.fallback, "/fallback"));
  return {
    valid: !diagnostics.some(({ severity }) => severity === "error"),
    diagnostics: Object.freeze(diagnostics)
  };
}

function numeric(value: JsonValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function equal(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null)
    return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isEmpty(value: JsonValue): boolean {
  return (
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (value !== null &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      Object.keys(value).length === 0)
  );
}

export class ThresholdEvaluator {
  readonly #regexCache = new Map<string, RegExp | null>();

  public get regexCacheSize(): number {
    return this.#regexCache.size;
  }

  public evaluateRule(
    rule: Readonly<ThresholdRule>,
    context: Readonly<ThresholdEvaluationContext>
  ): ConditionEvaluationResult {
    const validation = validateThresholdRule(rule);
    if (!validation.valid)
      return {
        matched: false,
        success: false,
        diagnostics: validation.diagnostics,
        dependencies: Object.freeze([])
      };
    const value = context.value;
    const compare = rule.compareValue;
    const a = numeric(value);
    const b = compare === undefined ? undefined : numeric(compare);
    let matched = false;
    let invalid = false;
    switch (rule.operator) {
      case "==":
      case "equals":
        matched = compare !== undefined && equal(value, compare);
        break;
      case "!=":
        matched = compare !== undefined && !equal(value, compare);
        break;
      case ">":
        matched = a !== undefined && b !== undefined && a > b;
        invalid = a === undefined || b === undefined;
        break;
      case ">=":
        matched = a !== undefined && b !== undefined && a >= b;
        invalid = a === undefined || b === undefined;
        break;
      case "<":
        matched = a !== undefined && b !== undefined && a < b;
        invalid = a === undefined || b === undefined;
        break;
      case "<=":
        matched = a !== undefined && b !== undefined && a <= b;
        invalid = a === undefined || b === undefined;
        break;
      case "between":
      case "betweenExclusive":
      case "betweenLeftExclusive":
      case "betweenRightExclusive": {
        const c = numeric(rule.compareValue2 as JsonValue);
        invalid = a === undefined || b === undefined || c === undefined;
        if (a !== undefined && b !== undefined && c !== undefined) {
          const input = a;
          const lower = b;
          const upper = c;
          const left =
            rule.operator === "between" || rule.operator === "betweenRightExclusive"
              ? input >= lower
              : input > lower;
          const right =
            rule.operator === "between" || rule.operator === "betweenLeftExclusive"
              ? input <= upper
              : input < upper;
          matched = left && right;
        }
        break;
      }
      case "true":
        matched = value === true;
        break;
      case "false":
        matched = value === false;
        break;
      case "isNull":
        matched = value === null;
        break;
      case "isNotNull":
        matched = value !== null;
        break;
      case "isEmpty":
        matched = isEmpty(value);
        break;
      case "isNotEmpty":
        matched = !isEmpty(value);
        break;
      case "contains":
      case "startsWith":
      case "endsWith":
        invalid = typeof value !== "string" || typeof compare !== "string";
        if (!invalid) {
          const text = value as string;
          const expected = compare as string;
          matched =
            rule.operator === "contains"
              ? text.includes(expected)
              : rule.operator === "startsWith"
                ? text.startsWith(expected)
                : text.endsWith(expected);
        }
        break;
      case "matchesRegex": {
        invalid = typeof value !== "string" || typeof compare !== "string";
        if (!invalid) {
          const source = compare as string;
          let regex = this.#regexCache.get(source);
          if (regex === undefined) {
            regex = compileSafeRegex(source) ?? null;
            this.#regexCache.set(source, regex);
          }
          invalid = regex === null;
          matched = regex?.test(value as string) ?? false;
        }
        break;
      }
      case "oneOf":
      case "notOneOf": {
        const values: readonly JsonValue[] = Array.isArray(compare)
          ? (compare as readonly JsonValue[])
          : [];
        const found = values.some((entry) => equal(value, entry));
        matched = rule.operator === "oneOf" ? found : !found;
        break;
      }
      case "quality":
        matched =
          typeof compare === "string" && context.quality?.toUpperCase() === compare.toUpperCase();
        break;
      case "olderThan":
      case "newerThan":
      case "within": {
        const timestamp = context.timestamp;
        invalid = timestamp === undefined || b === undefined;
        const age = (context.now ?? Date.now()) - (timestamp ?? 0);
        matched =
          rule.operator === "olderThan"
            ? age > (b ?? 0)
            : rule.operator === "newerThan"
              ? (timestamp ?? 0) > (b ?? 0)
              : Math.abs(age) <= (b ?? 0);
        break;
      }
    }
    const diagnostics = invalid
      ? [
          diagnostic(
            "THRESHOLD_INVALID_COMPARISON",
            `Values are incompatible with ${rule.operator}.`
          )
        ]
      : [];
    return {
      matched: !invalid && matched,
      success: !invalid,
      diagnostics: Object.freeze(diagnostics),
      dependencies: Object.freeze([])
    };
  }
}

export class ConditionEvaluator {
  readonly #thresholds: ThresholdEvaluator;
  readonly #expressions = new Map<string, CompiledExpression | null>();

  public constructor(thresholds = new ThresholdEvaluator()) {
    this.#thresholds = thresholds;
  }
  public get expressionCacheSize(): number {
    return this.#expressions.size;
  }

  public evaluate(
    condition: Readonly<Condition>,
    context: Readonly<ThresholdEvaluationContext>
  ): ConditionEvaluationResult {
    if (condition.kind === "threshold")
      return this.#thresholds.evaluateRule(condition.rule, context);
    if (condition.kind === "not") {
      const child = this.evaluate(condition.condition, context);
      return { ...child, matched: child.success && !child.matched };
    }
    if (condition.kind === "and" || condition.kind === "or") {
      const results: ConditionEvaluationResult[] = [];
      for (const child of condition.conditions) {
        const result = this.evaluate(child, context);
        results.push(result);
        if (condition.kind === "and" && (!result.success || !result.matched)) break;
        if (condition.kind === "or" && result.success && result.matched) break;
      }
      return {
        matched:
          condition.kind === "and"
            ? results.every((result) => result.success && result.matched)
            : results.some((result) => result.success && result.matched),
        success: results.every((result) => result.success),
        diagnostics: Object.freeze(results.flatMap(({ diagnostics }) => diagnostics)),
        dependencies: normalizeBindingDependencies(
          results.flatMap(({ dependencies }) => dependencies)
        )
      };
    }
    let compiled = this.#expressions.get(condition.expression);
    if (compiled === undefined) {
      const result = compileExpression(condition.expression, {
        ...(context.expressionFunctions === undefined
          ? {}
          : { functions: context.expressionFunctions })
      });
      compiled = result.success ? result.compiled : null;
      this.#expressions.set(condition.expression, compiled);
      if (!result.success)
        return {
          matched: false,
          success: false,
          diagnostics: result.diagnostics,
          dependencies: Object.freeze([])
        };
    }
    if (compiled === null)
      return {
        matched: false,
        success: false,
        diagnostics: [
          diagnostic("THRESHOLD_EXPRESSION_ERROR", "Condition expression did not compile.")
        ],
        dependencies: Object.freeze([])
      };
    if (context.runtime === undefined)
      return {
        matched: false,
        success: false,
        diagnostics: [
          diagnostic(
            "THRESHOLD_EXPRESSION_ERROR",
            "Expression conditions require a runtime snapshot."
          )
        ],
        dependencies: compiled.dependencies
      };
    const evaluated = evaluateExpression(compiled, {
      runtime: context.runtime,
      ...(context.expressionFunctions === undefined
        ? {}
        : { functions: context.expressionFunctions })
    });
    if (!evaluated.success || typeof evaluated.value !== "boolean")
      return {
        matched: false,
        success: false,
        diagnostics: evaluated.success
          ? [diagnostic("THRESHOLD_EXPRESSION_ERROR", "Condition expression must return boolean.")]
          : [evaluated.diagnostic],
        dependencies: compiled.dependencies
      };
    return {
      matched: evaluated.value,
      success: true,
      diagnostics: Object.freeze([]),
      dependencies: compiled.dependencies
    };
  }
}

export class RuleResolver {
  public resolve(
    matches: readonly ThresholdRule[],
    resolution: ThresholdConflictResolution
  ): readonly ThresholdRule[] {
    if (matches.length === 0) return Object.freeze([]);
    const first = matches[0];
    if (first === undefined) return Object.freeze([]);
    if (resolution === "ALL_MATCHES") return Object.freeze([...matches]);
    if (resolution === "LAST_MATCH") return Object.freeze([matches.at(-1) ?? first]);
    if (resolution === "HIGHEST_PRIORITY") {
      let winner = first;
      for (const candidate of matches.slice(1))
        if ((candidate.priority ?? 0) > (winner.priority ?? 0)) winner = candidate;
      return Object.freeze([winner]);
    }
    return Object.freeze([first]);
  }
}

export class ThresholdRuleSetEvaluator {
  readonly #thresholds: ThresholdEvaluator;
  readonly #resolver: RuleResolver;
  public constructor(thresholds = new ThresholdEvaluator(), resolver = new RuleResolver()) {
    this.#thresholds = thresholds;
    this.#resolver = resolver;
  }
  public evaluate(
    set: Readonly<ThresholdRuleSet>,
    context: Readonly<ThresholdEvaluationContext>
  ): ResolvedThresholdResult {
    if (set.enabled === false)
      return {
        success: true,
        status: "disabled",
        matchedRuleIds: [],
        diagnostics: [],
        dependencies: []
      };
    const validation = validateThresholdRuleSet(set);
    if (!validation.valid) return this.fallback(set, validation.diagnostics, "invalid");
    const diagnostics = [...validation.diagnostics];
    const matches: ThresholdRule[] = [];
    for (const rule of set.rules) {
      if (rule.enabled === false) continue;
      const result = this.#thresholds.evaluateRule(rule, context);
      diagnostics.push(...result.diagnostics);
      if (result.matched) {
        matches.push(rule);
        if (set.conflictResolution === "FIRST_MATCH") break;
      }
    }
    const resolved = this.#resolver.resolve(matches, set.conflictResolution);
    if (resolved.length === 0)
      return this.fallback(
        set,
        [
          ...diagnostics,
          diagnostic("THRESHOLD_NO_MATCH", "No threshold rule matched.", undefined, "warning")
        ],
        "unresolved"
      );
    const outputs = resolved.map(({ output }) => output);
    const firstOutput = outputs[0];
    if (firstOutput === undefined) return this.fallback(set, diagnostics, "unresolved");
    return {
      success: true,
      status: "resolved",
      value:
        outputs.length === 1 ? firstOutput.value : Object.freeze(outputs.map(({ value }) => value)),
      output: outputs.length === 1 ? firstOutput : Object.freeze(outputs),
      matchedRuleIds: Object.freeze(resolved.map(({ id }) => id)),
      diagnostics: Object.freeze(diagnostics),
      dependencies: Object.freeze([])
    };
  }
  private fallback(
    set: Readonly<ThresholdRuleSet>,
    diagnostics: readonly BindingDiagnostic[],
    status: "invalid" | "unresolved"
  ): ResolvedThresholdResult {
    if (set.fallback === undefined)
      return {
        success: false,
        status,
        matchedRuleIds: [],
        diagnostics: Object.freeze([...diagnostics]),
        dependencies: []
      };
    return {
      success: status !== "invalid",
      status: "fallback",
      value: set.fallback.value,
      output: set.fallback,
      matchedRuleIds: [],
      diagnostics: Object.freeze([
        ...diagnostics,
        diagnostic("THRESHOLD_FALLBACK_USED", "Threshold fallback was used.", undefined, "warning")
      ]),
      dependencies: []
    };
  }
}

export class ConditionalBindingEvaluator {
  readonly #conditions: ConditionEvaluator;
  public constructor(conditions = new ConditionEvaluator()) {
    this.#conditions = conditions;
  }
  public evaluate(
    binding: Readonly<ConditionalBinding>,
    context: Readonly<ThresholdEvaluationContext>
  ): ResolvedThresholdResult {
    const diagnostics: BindingDiagnostic[] = [];
    const dependencies: BindingDependency[] = [];
    for (const branch of binding.branches) {
      if (branch.condition !== undefined) {
        const result = this.#conditions.evaluate(branch.condition, context);
        diagnostics.push(...result.diagnostics);
        dependencies.push(...result.dependencies);
        if (!result.success || !result.matched) continue;
      }
      if ("branches" in branch.output) {
        const nested = this.evaluate(branch.output, context);
        return {
          ...nested,
          diagnostics: Object.freeze([...diagnostics, ...nested.diagnostics]),
          dependencies: normalizeBindingDependencies([...dependencies, ...nested.dependencies])
        };
      }
      return {
        success: true,
        status: "resolved",
        value: branch.output.value,
        output: branch.output,
        matchedRuleIds: [branch.id],
        diagnostics: Object.freeze(diagnostics),
        dependencies: normalizeBindingDependencies(dependencies)
      };
    }
    if (binding.fallback !== undefined)
      return {
        success: true,
        status: "fallback",
        value: binding.fallback.value,
        output: binding.fallback,
        matchedRuleIds: [],
        diagnostics: Object.freeze([
          ...diagnostics,
          diagnostic(
            "THRESHOLD_FALLBACK_USED",
            "Conditional fallback was used.",
            undefined,
            "warning"
          )
        ]),
        dependencies: normalizeBindingDependencies(dependencies)
      };
    return {
      success: false,
      status: "unresolved",
      matchedRuleIds: [],
      diagnostics: Object.freeze([
        ...diagnostics,
        diagnostic("THRESHOLD_NO_MATCH", "No conditional branch matched.", undefined, "warning")
      ]),
      dependencies: normalizeBindingDependencies(dependencies)
    };
  }
}

/** Immutable JSON serialization. Unknown future schema versions are rejected explicitly. */
export function serializeThresholdRuleSet(set: Readonly<ThresholdRuleSet>): string {
  return JSON.stringify(set);
}
export function deserializeThresholdRuleSet(serialized: string): ThresholdRuleSet {
  const value: unknown = JSON.parse(serialized);
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== THRESHOLD_SCHEMA_VERSION
  )
    throw new TypeError("Unsupported threshold rule-set schema version.");
  const set = value as ThresholdRuleSet;
  const validation = validateThresholdRuleSet(set);
  if (!validation.valid)
    throw new TypeError(validation.diagnostics.map(({ message }) => message).join(" "));
  return deepFreeze(set);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** O(1) reverse dependency lookup for incremental scheduling. */
export class ThresholdDependencyTracker {
  readonly #byDependency = new Map<string, Set<string>>();
  readonly #byBinding = new Map<string, readonly BindingDependency[]>();
  public set(bindingId: string, dependencies: readonly BindingDependency[]): void {
    this.delete(bindingId);
    const normalized = normalizeBindingDependencies(dependencies);
    this.#byBinding.set(bindingId, normalized);
    for (const dependency of normalized) {
      const key = getBindingDependencyKey(dependency);
      const ids = this.#byDependency.get(key) ?? new Set<string>();
      ids.add(bindingId);
      this.#byDependency.set(key, ids);
    }
  }
  public delete(bindingId: string): void {
    for (const dependency of this.#byBinding.get(bindingId) ?? []) {
      const key = getBindingDependencyKey(dependency);
      const ids = this.#byDependency.get(key);
      ids?.delete(bindingId);
      if (ids?.size === 0) this.#byDependency.delete(key);
    }
    this.#byBinding.delete(bindingId);
  }
  public affected(dependencies: readonly BindingDependency[]): readonly string[] {
    const ids = new Set<string>();
    for (const dependency of dependencies)
      for (const id of this.#byDependency.get(getBindingDependencyKey(dependency)) ?? [])
        ids.add(id);
    return Object.freeze([...ids].sort());
  }
}
