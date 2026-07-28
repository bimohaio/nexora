import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@web-scada/runtime-engine";
import {
  ConditionalBindingEvaluator,
  ConditionEvaluator,
  RuleResolver,
  ThresholdDependencyTracker,
  ThresholdEvaluator,
  ThresholdRuleSetEvaluator,
  deserializeThresholdRuleSet,
  serializeThresholdRuleSet,
  validateThresholdRuleSet,
  type ThresholdOutput,
  type ThresholdRule,
  type ThresholdRuleSet
} from "./index.js";

const output = (value: string): ThresholdOutput => ({ kind: "color", value });
const rule = (
  operator: ThresholdRule["operator"],
  compareValue?: ThresholdRule["compareValue"],
  compareValue2?: ThresholdRule["compareValue2"]
): ThresholdRule => ({
  id: operator,
  operator,
  ...(compareValue === undefined ? {} : { compareValue }),
  ...(compareValue2 === undefined ? {} : { compareValue2 }),
  output: output("red")
});

describe("threshold evaluation", () => {
  const evaluator = new ThresholdEvaluator();
  const matches = (
    candidate: ThresholdRule,
    value: ThresholdRule["compareValue"],
    extra = {}
  ): boolean => evaluator.evaluateRule(candidate, { value: value ?? null, ...extra }).matched;

  it("supports equality, numeric, range, boolean, null and empty operators", () => {
    expect(matches(rule("==", 4), 4)).toBe(true);
    expect(matches(rule("!=", 4), 5)).toBe(true);
    expect(matches(rule(">", 4), 5)).toBe(true);
    expect(matches(rule(">=", 4), 4)).toBe(true);
    expect(matches(rule("<", 4), 3)).toBe(true);
    expect(matches(rule("<=", 4), 4)).toBe(true);
    expect(matches(rule("between", 1, 3), 3)).toBe(true);
    expect(matches(rule("betweenExclusive", 1, 3), 3)).toBe(false);
    expect(matches(rule("betweenLeftExclusive", 1, 3), 1)).toBe(false);
    expect(matches(rule("betweenRightExclusive", 1, 3), 1)).toBe(true);
    expect(matches(rule("true"), true)).toBe(true);
    expect(matches(rule("false"), false)).toBe(true);
    expect(matches(rule("isNull"), null)).toBe(true);
    expect(matches(rule("isNotNull"), 0)).toBe(true);
    expect(matches(rule("isEmpty"), [])).toBe(true);
    expect(matches(rule("isNotEmpty"), [1])).toBe(true);
  });

  it("supports string, enum, quality, timestamp and cached safe regex operators", () => {
    expect(matches(rule("equals", "pump"), "pump")).toBe(true);
    expect(matches(rule("contains", "ump"), "pump")).toBe(true);
    expect(matches(rule("startsWith", "pu"), "pump")).toBe(true);
    expect(matches(rule("endsWith", "mp"), "pump")).toBe(true);
    expect(matches(rule("matchesRegex", "^p[a-z]+$"), "pump")).toBe(true);
    expect(matches(rule("matchesRegex", "^p[a-z]+$"), "pump")).toBe(true);
    expect(evaluator.regexCacheSize).toBe(1);
    expect(matches(rule("oneOf", ["a", "b"]), "b")).toBe(true);
    expect(matches(rule("notOneOf", ["a"]), "b")).toBe(true);
    expect(matches(rule("quality", "GOOD"), 0, { quality: "good" })).toBe(true);
    expect(matches(rule("olderThan", 100), 0, { timestamp: 100, now: 201 })).toBe(true);
    expect(matches(rule("newerThan", 100), 0, { timestamp: 101, now: 201 })).toBe(true);
    expect(matches(rule("within", 100), 0, { timestamp: 150, now: 201 })).toBe(true);
  });

  it("rejects unsafe regex and reports invalid comparisons", () => {
    expect(
      validateThresholdRuleSet({
        schemaVersion: 1,
        id: "bad",
        conflictResolution: "FIRST_MATCH",
        rules: [rule("matchesRegex", "(a+)+$")]
      }).valid
    ).toBe(false);
    expect(evaluator.evaluateRule(rule(">", 2), { value: "2" }).success).toBe(false);
  });
});

describe("rule and conditional resolution", () => {
  const set: ThresholdRuleSet = {
    schemaVersion: 1,
    id: "pressure-color",
    conflictResolution: "FIRST_MATCH",
    rules: [
      { ...rule(">", 80), id: "high", output: output("red") },
      { ...rule(">", 60), id: "medium", output: output("yellow") }
    ],
    fallback: output("green")
  };

  it("is deterministic across conflict strategies and fallback", () => {
    const evaluator = new ThresholdRuleSetEvaluator();
    expect(evaluator.evaluate(set, { value: 90 }).value).toBe("red");
    expect(evaluator.evaluate(set, { value: 70 }).value).toBe("yellow");
    expect(evaluator.evaluate(set, { value: 40 }).value).toBe("green");
    const candidates = [
      { ...rule("true"), id: "first", priority: 1 },
      { ...rule("true"), id: "last", priority: 5 }
    ];
    expect(new RuleResolver().resolve(candidates, "LAST_MATCH")[0]?.id).toBe("last");
    expect(new RuleResolver().resolve(candidates, "HIGHEST_PRIORITY")[0]?.id).toBe("last");
    expect(new RuleResolver().resolve(candidates, "ALL_MATCHES")).toHaveLength(2);
  });

  it("supports AND/OR/NOT and nested IF/ELSE IF/ELSE", () => {
    const conditions = new ConditionEvaluator();
    const composite = {
      kind: "and" as const,
      conditions: [
        { kind: "threshold" as const, rule: rule(">", 10) },
        { kind: "not" as const, condition: { kind: "threshold" as const, rule: rule(">", 20) } }
      ]
    };
    expect(conditions.evaluate(composite, { value: 15 }).matched).toBe(true);
    const nested = {
      schemaVersion: 1 as const,
      id: "nested",
      branches: [
        {
          id: "outer",
          condition: { kind: "threshold" as const, rule: rule(">", 10) },
          output: {
            schemaVersion: 1 as const,
            id: "inner",
            branches: [
              {
                id: "critical",
                condition: { kind: "threshold" as const, rule: rule(">", 80) },
                output: output("red")
              },
              { id: "else", output: output("yellow") }
            ]
          }
        }
      ],
      fallback: output("green")
    };
    expect(new ConditionalBindingEvaluator().evaluate(nested, { value: 50 }).value).toBe("yellow");
  });

  it("integrates safe expressions and extracts runtime dependencies", () => {
    const point = {
      key: "pressure",
      value: 90,
      quality: "good",
      timestamp: 1,
      ingestionTimestamp: 1
    } as const;
    const runtime: RuntimeSnapshot = {
      revision: 1,
      timestamp: 1,
      size: 1,
      has: (key) => key === "pressure",
      get: (key) => (key === "pressure" ? point : undefined),
      getAll: () => [point]
    };
    const result = new ConditionEvaluator().evaluate(
      { kind: "expression", expression: "$pressure > 80" },
      { value: 0, runtime }
    );
    expect(result.matched).toBe(true);
    expect(result.dependencies).toEqual([{ kind: "runtime-value", key: "pressure" }]);
  });

  it("round-trips immutably and tracks affected bindings", () => {
    const restored = deserializeThresholdRuleSet(serializeThresholdRuleSet(set));
    expect(restored).toEqual(set);
    expect(Object.isFrozen(restored.rules)).toBe(true);
    const tracker = new ThresholdDependencyTracker();
    tracker.set("fill", [{ kind: "runtime-value", key: "pressure" }]);
    tracker.set("text", [{ kind: "runtime-value", key: "temperature" }]);
    expect(tracker.affected([{ kind: "runtime-value", key: "pressure" }])).toEqual(["fill"]);
  });
});
