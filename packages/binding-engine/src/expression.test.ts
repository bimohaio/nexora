import { describe, expect, it, vi } from "vitest";
import {
  createScadaDocument,
  parseDocumentJson,
  serializeDocumentJson,
  type JsonValue
} from "@web-scada/core";
import type { DataQuality, RuntimeDataPoint } from "@web-scada/runtime-engine";
import {
  BindingTypeRegistry,
  DEFAULT_EXPRESSION_LIMITS,
  EXPRESSION_LANGUAGE_VERSION,
  ExpressionFunctionRegistry,
  compileExpression,
  createDefaultExpressionFunctionRegistry,
  evaluateExpression,
  evaluateExpressionBinding,
  evaluateExpressionBindings,
  extractExpressionDependencies,
  parseExpression,
  registerExpressionBindingType,
  tokenizeExpression,
  type CompiledExpression,
  type DirectBindingDefinition,
  type ExpressionBindingDefinition,
  type ExpressionEvaluationContext,
  type RuntimeBindingValueReader
} from "./index.js";

function point(
  key: string,
  value: JsonValue,
  quality: DataQuality = "good",
  timestamp = 1_000
): RuntimeDataPoint {
  return { key, value, quality, timestamp, ingestionTimestamp: timestamp };
}

function runtime(
  values: Readonly<Record<string, RuntimeDataPoint>> = {}
): RuntimeBindingValueReader {
  return {
    revision: 12,
    timestamp: 2_000,
    get: vi.fn((key: string) => values[key])
  };
}

function compile(source: string): CompiledExpression {
  const result = compileExpression(source);
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));
  return result.compiled;
}

function value(
  source: string,
  context: ExpressionEvaluationContext = { runtime: runtime() }
): JsonValue {
  const result = evaluateExpression(compile(source), context);
  if (!result.success) throw new Error(JSON.stringify(result.diagnostic));
  return result.value;
}

function binding(
  expression: string,
  overrides: Partial<ExpressionBindingDefinition> = {}
): ExpressionBindingDefinition {
  return {
    id: "binding_expression_01",
    source: {
      type: "expression",
      expression,
      language: EXPRESSION_LANGUAGE_VERSION
    },
    target: { type: "node-property", nodeId: "node_pump_01", property: "active" },
    mode: "one-way",
    enabled: true,
    ...overrides
  };
}

describe("expression tokenizer and parser", () => {
  it("tokenizes literals, references, operators, escapes, and zero-based ranges", () => {
    const result = tokenizeExpression('$plant.level >= 10 && "a\\n" != null');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tokens.map(({ kind }) => kind)).toEqual([
      "runtime-reference",
      "greater-equal",
      "number",
      "and-and",
      "string",
      "bang-equal",
      "null",
      "eof"
    ]);
    expect(result.tokens[0]?.range).toEqual({ start: 0, end: 12 });
    expect(result.tokens[4]?.value).toBe("a\n");
  });

  it.each([
    ['"unterminated', "EXPRESSION_UNTERMINATED_STRING"],
    ['"bad\\x"', "EXPRESSION_INVALID_ESCAPE"],
    ["$plant..level", "EXPRESSION_INVALID_RUNTIME_REFERENCE"],
    ["$plant.__proto__.x", "EXPRESSION_INVALID_RUNTIME_REFERENCE"],
    ["1 = 2", "EXPRESSION_INVALID_CHARACTER"],
    ["0x10", "EXPRESSION_UNEXPECTED_TOKEN"]
  ])("rejects malformed source %s", (source, code) => {
    const result = compileExpression(source);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostics[0]?.code).toBe(code);
  });

  it("respects precedence and rejects trailing, missing delimiter, and chained comparison", () => {
    expect(value("1 + 2 * 3")).toBe(7);
    expect(value("(1 + 2) * 3")).toBe(9);
    expect(compileExpression("1 2").success).toBe(false);
    expect(compileExpression("(1 + 2").success).toBe(false);
    expect(compileExpression("1 < 2 < 3").success).toBe(false);
  });

  it("exposes immutable readonly AST nodes", () => {
    const compiled = compile("1 + 2");
    expect(Object.isFrozen(compiled.ast)).toBe(true);
    expect(Object.isFrozen(compiled.ast.range)).toBe(true);
    expect(Object.isFrozen(compiled.dependencies)).toBe(true);
  });

  it("keeps tokenizer and parser as independently usable public stages", () => {
    const tokenized = tokenizeExpression("true ? 1 : 2");
    expect(tokenized.success).toBe(true);
    if (!tokenized.success) return;
    const parsed = parseExpression(tokenized.tokens);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.ast.kind).toBe("conditional");
  });
});

describe("expression semantics", () => {
  it.each([
    ["true", true],
    ["false", false],
    ["null", null],
    ["-5", -5],
    ["1e3", 1000],
    ['"status"', "status"],
    ["10 / 2 + 3", 8],
    ["10 % 4", 2],
    ["2 < 3", true],
    ['"a" < "b"', true],
    ['1 == "1"', false],
    ["false == 0", false],
    ["null == null", true],
    ["!false", true],
    ["true && false", false],
    ["false || true", true],
    ["true ? 10 : 20", 10],
    ["abs(-3)", 3],
    ["min(3, 1, 2)", 1],
    ["max(3, 1, 2)", 3],
    ["clamp(120, 0, 100)", 100],
    ["round(1.6)", 2],
    ["floor(1.6)", 1],
    ["ceil(1.2)", 2],
    ["coalesce(null, 4)", 4],
    ["if(true, 1, 2)", 1]
  ])("evaluates %s deterministically", (source, expected) => {
    expect(value(source)).toEqual(expected);
  });

  it.each([
    ["1 + true", "EXPRESSION_TYPE_MISMATCH"],
    ["1 && true", "EXPRESSION_TYPE_MISMATCH"],
    ["1 < '1'", "EXPRESSION_TYPE_MISMATCH"],
    ["1 / 0", "EXPRESSION_DIVISION_BY_ZERO"],
    ["1 % 0", "EXPRESSION_REMAINDER_BY_ZERO"],
    ["abs('x')", "EXPRESSION_FUNCTION_ERROR"]
  ])("returns typed evaluation failure for %s", (source, code) => {
    const result = evaluateExpression(compile(source), { runtime: runtime() });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostic.code).toBe(code);
  });

  it("short-circuits logical, conditional, and if branches", () => {
    const get = vi.fn<RuntimeBindingValueReader["get"]>();
    const context = { runtime: { revision: 1, get } };
    expect(value("false && $missing", context)).toBe(false);
    expect(value("true || $missing", context)).toBe(true);
    expect(value("true ? 1 : $missing", context)).toBe(1);
    expect(value("if(false, $missing, 2)", context)).toBe(2);
    expect(get).not.toHaveBeenCalled();
  });

  it("supports controlled trusted function registries only", () => {
    const functions = new ExpressionFunctionRegistry();
    functions.register({
      name: "double",
      minimumArguments: 1,
      maximumArguments: 1,
      evaluate: ([input]) => (input as number) * 2
    });
    const custom = compileExpression("double(4)", { functions });
    if (!custom.success) throw new Error(JSON.stringify(custom.diagnostics));
    const customResult = evaluateExpression(custom.compiled, {
      runtime: runtime(),
      functions
    });
    expect(customResult.success && customResult.value).toBe(8);
    const registered = functions.get("double");
    if (registered === undefined) throw new Error("Expected registered function.");
    expect(() => {
      functions.register(registered);
    }).toThrow();
    expect(compileExpression("globalThis()").success).toBe(false);
    expect(compileExpression("process").success).toBe(false);
  });
});

describe("dependencies, limits, and security", () => {
  it("extracts unique dependencies in source order from all branches without lookup", () => {
    const compiled = compile("$plant.a > 0 ? $plant.b : $plant.a");
    expect(compiled.dependencies).toEqual([
      { kind: "runtime-value", key: "plant.a" },
      { kind: "runtime-value", key: "plant.b" }
    ]);
    expect(extractExpressionDependencies(compiled.ast)).toEqual(compiled.dependencies);
  });

  it.each([
    [{ maximumSourceLength: 2 }, "123", "EXPRESSION_SOURCE_TOO_LONG"],
    [{ maximumTokenCount: 2 }, "1 + 2", "EXPRESSION_TOKEN_LIMIT_EXCEEDED"],
    [{ maximumAstNodes: 2 }, "1 + 2", "EXPRESSION_AST_LIMIT_EXCEEDED"],
    [{ maximumNestingDepth: 1 }, "((1))", "EXPRESSION_NESTING_LIMIT_EXCEEDED"],
    [{ maximumStringLength: 2 }, '"abc"', "EXPRESSION_STRING_LIMIT_EXCEEDED"],
    [{ maximumRuntimeReferences: 1 }, "$plant.a + $plant.b", "EXPRESSION_DEPENDENCY_LIMIT_EXCEEDED"]
  ])("enforces compile limit %o", (override, source, code) => {
    const result = compileExpression(source, {
      limits: { ...DEFAULT_EXPRESSION_LIMITS, ...override }
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostics[0]?.code).toBe(code);
  });

  it("enforces deterministic evaluation steps", () => {
    const result = evaluateExpression(compile("1 + 2 + 3"), {
      runtime: runtime(),
      limits: { ...DEFAULT_EXPRESSION_LIMITS, maximumEvaluationSteps: 2 }
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.diagnostic.code).toBe("EXPRESSION_EVALUATION_LIMIT_EXCEEDED");
  });

  it.each([
    "globalThis",
    "window",
    "document",
    "process",
    "require",
    "constructor",
    "__proto__",
    "prototype",
    "Math.random()",
    "a.b",
    "a[0]",
    "x = 1",
    "() => 1",
    "`template`"
  ])("rejects ambient or executable syntax: %s", (source) => {
    expect(compileExpression(source).success).toBe(false);
  });

  it("never throws for a deterministic fuzz-style source corpus", () => {
    const alphabet = "abc$._012+-*/%!?=:()[]'\"` ";
    let seed = 17;
    for (let sample = 0; sample < 250; sample += 1) {
      let source = "";
      for (let index = 0; index < 32; index += 1) {
        seed = (seed * 48271) % 2147483647;
        source += alphabet.charAt(seed % alphabet.length);
      }
      expect(() => compileExpression(source)).not.toThrow();
    }
  });

  it("clones and freezes structured values from custom readers", () => {
    const sourceValue = { nested: { value: 1 } };
    const resolved = evaluateExpression(compile("$plant.object"), {
      runtime: runtime({
        "plant.object": point("plant.object", sourceValue)
      })
    });
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;
    expect(Object.isFrozen(resolved.value)).toBe(true);
    expect(resolved.value).not.toBe(sourceValue);
    sourceValue.nested.value = 2;
    expect(resolved.value).toEqual({ nested: { value: 1 } });
  });
});

describe("expression binding integration", () => {
  it("evaluates runtime expressions and preserves revision and dependencies", () => {
    const result = evaluateExpressionBinding(binding("$plant.temperature > 80"), {
      runtime: runtime({
        "plant.temperature": point("plant.temperature", 85)
      })
    });
    expect(result).toMatchObject({
      status: "resolved",
      value: true,
      revision: 12,
      language: EXPRESSION_LANGUAGE_VERSION,
      dependencies: [{ kind: "runtime-value", key: "plant.temperature" }]
    });
  });

  it("uses fallback for missing, bad-quality, and arithmetic failures", () => {
    const fallback = binding("$plant.value / 0", { fallback: false });
    expect(
      evaluateExpressionBinding(fallback, {
        runtime: runtime({ "plant.value": point("plant.value", 10) })
      }).status
    ).toBe("fallback");
    expect(
      evaluateExpressionBinding(binding("$missing", { fallback: false }), {
        runtime: runtime()
      }).status
    ).toBe("fallback");
    expect(
      evaluateExpressionBinding(binding("$bad", { fallback: false }), {
        runtime: runtime({ bad: point("bad", true, "bad") })
      }).status
    ).toBe("fallback");
  });

  it("does not hide syntax/limit failures behind fallback", () => {
    const result = evaluateExpressionBinding(binding("1 +", { fallback: false }), {
      runtime: runtime()
    });
    expect(result.status).toBe("invalid");
    expect(result.value).toBeUndefined();
    const limited = evaluateExpressionBinding(binding("true", { fallback: false }), {
      runtime: runtime(),
      limits: { ...DEFAULT_EXPRESSION_LIMITS, maximumEvaluationSteps: 0 }
    });
    expect(limited.status).toBe("invalid");
    expect(limited.value).toBeUndefined();
  });

  it("validates target result and fallback types", () => {
    expect(evaluateExpressionBinding(binding("1"), { runtime: runtime() }).status).toBe("invalid");
    expect(
      evaluateExpressionBinding(binding("1", { fallback: true }), {
        runtime: runtime()
      }).status
    ).toBe("fallback");
    expect(
      evaluateExpressionBinding(binding("1", { fallback: "bad" }), {
        runtime: runtime()
      }).status
    ).toBe("invalid");
  });

  it("isolates ordered batches and leaves direct binding contracts unchanged", () => {
    const results = evaluateExpressionBindings(
      [binding("true", { id: "good" }), binding("$missing", { id: "missing" })],
      { runtime: runtime() }
    );
    expect(results.map(({ bindingId, status }) => [bindingId, status])).toEqual([
      ["good", "resolved"],
      ["missing", "unresolved"]
    ]);
    const direct: DirectBindingDefinition = {
      id: "direct",
      source: { type: "tag", tagId: "plant.running" },
      target: { type: "visibility", entityId: "node_pump_01" },
      mode: "one-way",
      enabled: true
    };
    expect(direct.source.type).toBe("tag");
  });

  it("isolates unexpected compiler-service failures in a batch", () => {
    class ThrowingFunctions extends ExpressionFunctionRegistry {
      public override get(): never {
        throw new Error("internal secret");
      }
    }
    const results = evaluateExpressionBindings(
      [binding("abs(1)", { id: "error" }), binding("true", { id: "disabled", enabled: false })],
      { runtime: runtime(), functions: new ThrowingFunctions() }
    );
    expect(results.map(({ status }) => status)).toEqual(["error", "disabled"]);
    expect(JSON.stringify(results)).not.toContain("internal secret");
  });

  it("registers expression dependencies without evaluation", () => {
    const registry = new BindingTypeRegistry();
    registerExpressionBindingType(registry);
    expect(registry.get("expression")?.getDependencies?.(binding("$a + $b"))).toEqual([
      { kind: "runtime-value", key: "a" },
      { kind: "runtime-value", key: "b" }
    ]);
    expect(() => {
      registerExpressionBindingType(registry);
    }).toThrow();
  });

  it("round trips language-versioned inert expression text through Core", () => {
    const base = createScadaDocument({ name: "Expressions" });
    const document = {
      ...base,
      nodes: [
        {
          id: "node_pump_01",
          name: "Pump",
          symbolType: "pump",
          transform: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
          },
          properties: {},
          bindings: ["binding_expression_01"],
          layerId: base.layers[0]?.id ?? "",
          visible: true,
          locked: false
        }
      ],
      bindings: [
        binding('if($plant.alarm, "<script>alert(1)</script>", "NORMAL")', {
          target: { type: "text", nodeId: "node_pump_01" }
        })
      ]
    };
    const serialized = serializeDocumentJson(document);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    const parsed = parseDocumentJson(serialized.json);
    expect(parsed.success).toBe(true);
    expect(serialized.json).toContain(EXPRESSION_LANGUAGE_VERSION);
    expect(serialized.json).not.toContain("\\u003c");
  });

  it("fails unsupported language versions safely", () => {
    const result = evaluateExpressionBinding(
      binding("true", {
        source: {
          type: "expression",
          expression: "true",
          language: "future-language"
        }
      }),
      { runtime: runtime() }
    );
    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.code).toBe("EXPRESSION_UNSUPPORTED_LANGUAGE");
  });

  it("ships an inspectable deterministic built-in registry", () => {
    expect(
      createDefaultExpressionFunctionRegistry()
        .list()
        .map(({ name }) => name)
    ).toEqual(["abs", "ceil", "clamp", "coalesce", "floor", "if", "max", "min", "round"]);
  });
});
