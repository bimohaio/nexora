import { describe, expect, it } from "vitest";
import type { PropertyBinding } from "@web-scada/core";
import {
  applyBindingTransforms,
  BindingTransformTypeRegistry,
  compileValueMapping,
  evaluateValueMapping,
  evaluateTransformedDirectBinding,
  evaluateTransformedExpressionBinding,
  formatBindingValue,
  registerFormattingTransformTypes,
  registerMappingTransformType,
  transformBindingEvaluationResult,
  validateValueMapping,
  type ValueMappingDefinition
} from "./index.js";

const mapping: ValueMappingDefinition = {
  type: "exact-value",
  rules: [
    { id: "zero", input: 0, output: "STOPPED" },
    { id: "running", input: 1, output: "RUNNING" },
    { input: false, output: "OFF" },
    { input: "", output: "EMPTY" },
    { input: null, output: "NULL" },
    { input: "__proto__", output: "<script>inert</script>" }
  ],
  unmatchedPolicy: "unresolved"
};

describe("exact value mapping", () => {
  it("matches primitive values strictly and treats negative zero as zero", () => {
    expect(evaluateValueMapping(1, mapping)).toMatchObject({
      status: "matched",
      value: "RUNNING",
      ruleId: "running"
    });
    expect(evaluateValueMapping("1", mapping).status).toBe("unmatched");
    expect(evaluateValueMapping(-0, mapping)).toMatchObject({ value: "STOPPED" });
    expect(evaluateValueMapping(false, mapping)).toMatchObject({ value: "OFF" });
    expect(evaluateValueMapping("", mapping)).toMatchObject({ value: "EMPTY" });
    expect(evaluateValueMapping(null, mapping)).toMatchObject({ value: "NULL" });
    expect(evaluateValueMapping("__proto__", mapping)).toMatchObject({
      value: "<script>inert</script>"
    });
    expect(({} as { inert?: string }).inert).toBeUndefined();
  });

  it("supports defaults and explicit passthrough", () => {
    expect(evaluateValueMapping(99, { ...mapping, defaultValue: "UNKNOWN" })).toMatchObject({
      status: "default",
      value: "UNKNOWN"
    });
    expect(evaluateValueMapping(99, { ...mapping, unmatchedPolicy: "passthrough" })).toMatchObject({
      status: "passthrough",
      value: 99
    });
  });

  it("rejects duplicate enabled rules, invalid numbers, and oversized tables", () => {
    expect(
      validateValueMapping({
        type: "exact-value",
        rules: [
          { input: 1, output: "a" },
          { input: 1, output: "b" },
          { input: 1, output: "disabled", enabled: false }
        ]
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "BINDING_MAPPING_DUPLICATE_INPUT" })])
    );
    expect(
      validateValueMapping({
        type: "exact-value",
        rules: [{ input: Number.NaN, output: "bad" }]
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "BINDING_MAPPING_INVALID_INPUT" })])
    );
    expect(validateValueMapping(mapping, { maximumMappingRules: 1 })[0]?.code).toBe(
      "BINDING_MAPPING_RULE_LIMIT_EXCEEDED"
    );
  });

  it("compiles without mutating or serializing the lookup", () => {
    const before = JSON.stringify(mapping);
    const result = compileValueMapping(mapping);
    expect(result.success).toBe(true);
    expect(JSON.stringify(mapping)).toBe(before);
    if (result.success) {
      expect(JSON.stringify(result.compiled)).toBe(JSON.stringify({ definition: mapping }));
    }
  });
});

describe("deterministic formatting", () => {
  const context = { locale: "en-US" };

  it("formats finite numbers with precision, grouping, units and affixes", () => {
    expect(
      formatBindingValue(
        1250.345,
        {
          type: "number",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: true,
          prefix: "$",
          unit: "kW",
          suffix: " estimated"
        },
        context
      )
    ).toMatchObject({ status: "formatted", value: "$1,250.35 kW estimated" });
    expect(
      formatBindingValue(
        -0,
        { type: "number", minimumFractionDigits: 1, maximumFractionDigits: 1 },
        context
      )
    ).toMatchObject({ value: "0.0" });
  });

  it("formats text, booleans and null only by explicit rules", () => {
    expect(
      formatBindingValue(false, { type: "text", trueText: "yes", falseText: "no" }, context)
    ).toMatchObject({ value: "no" });
    expect(
      formatBindingValue(null, { type: "text", nullText: "N/A", prefix: "[" }, context)
    ).toMatchObject({ value: "[N/A" });
    expect(
      formatBindingValue(
        true,
        { type: "boolean", trueText: "Running", falseText: "Stopped" },
        context
      )
    ).toMatchObject({ value: "Running" });
    expect(
      formatBindingValue(1, { type: "boolean", trueText: "yes", falseText: "no" }, context)
    ).toMatchObject({ status: "invalid" });
    expect(formatBindingValue(null, { type: "text" }, context)).toMatchObject({
      status: "invalid"
    });
  });

  it("rejects invalid precision and bounded output", () => {
    expect(
      formatBindingValue(
        1,
        { type: "number", minimumFractionDigits: 3, maximumFractionDigits: 2 },
        context
      )
    ).toMatchObject({ status: "invalid" });
    expect(
      formatBindingValue(
        "abcd",
        { type: "text" },
        {
          locale: "en-US",
          limits: {
            maximumPrefixLength: 2,
            maximumSuffixLength: 2,
            maximumUnitLength: 2,
            maximumOutputLength: 3,
            maximumFractionDigits: 2
          }
        }
      )
    ).toMatchObject({
      status: "invalid",
      diagnostics: [expect.objectContaining({ code: "BINDING_FORMAT_OUTPUT_TOO_LONG" })]
    });
  });
});

describe("mapping and formatting pipeline", () => {
  const definition: PropertyBinding = {
    id: "state",
    source: { type: "tag", tagId: "pump.state" },
    target: { type: "text", nodeId: "pump" },
    mode: "one-way",
    enabled: true,
    transformation: {
      type: "exact-value",
      options: { rules: [{ input: 1, output: 72.456 }] }
    },
    formatter: { type: "number", options: { maximumFractionDigits: 1, suffix: "%" } }
  };

  it("maps before formatting and validates the final target", () => {
    expect(applyBindingTransforms(1, definition, { locale: "en-US" })).toMatchObject({
      status: "resolved",
      value: "72.5%"
    });
  });

  it("evaluates direct and expression sources once before transforming", () => {
    let reads = 0;
    const runtime = {
      revision: 4,
      get(key: string) {
        reads += 1;
        return {
          key,
          value: 1,
          quality: "good" as const,
          timestamp: 10,
          ingestionTimestamp: 10
        };
      }
    };
    expect(
      evaluateTransformedDirectBinding(definition as never, {
        runtime,
        locale: "en-US"
      })
    ).toMatchObject({ status: "resolved", value: "72.5%", revision: 4 });
    expect(reads).toBe(1);

    const expression = {
      ...definition,
      source: { type: "expression", expression: "$pump.state" }
    } as const;
    expect(
      evaluateTransformedExpressionBinding(expression, {
        runtime,
        locale: "en-US"
      })
    ).toMatchObject({ status: "resolved", value: "72.5%", revision: 4 });
    expect(reads).toBe(2);
  });

  it("uses final fallback and preserves source metadata", () => {
    const withFallback = { ...definition, fallback: "N/A" };
    const source = {
      bindingId: "state",
      status: "resolved",
      target: definition.target,
      value: 99,
      dependencies: [{ kind: "runtime-value", key: "pump.state" }] as const,
      diagnostics: [],
      revision: 7
    } as const;
    expect(
      transformBindingEvaluationResult(source, withFallback, { locale: "en-US" })
    ).toMatchObject({
      status: "fallback",
      value: "N/A",
      revision: 7,
      dependencies: source.dependencies
    });
  });

  it("registers trusted transform types in an isolated registry", () => {
    const registry = new BindingTransformTypeRegistry();
    registerMappingTransformType(registry);
    registerFormattingTransformTypes(registry);
    expect(registry.list().map(({ type }) => type)).toEqual([
      "boolean",
      "exact-value",
      "identity",
      "number",
      "text"
    ]);
  });
});
