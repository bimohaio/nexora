import type { JsonValue, PropertyBinding } from "@web-scada/core";
import type { RuntimeSnapshot } from "@web-scada/runtime-engine";
import { describe, expect, it } from "vitest";
import {
  BindingDependencyGraph,
  IncrementalBindingEngine,
  bindingEvaluationOutputsEqual,
  extractBindingDependencies,
  getBindingDependencyKey,
  normalizeBindingDependencies
} from "./index.js";
import type { BindingEvaluationResult } from "./contracts.js";

function binding(id: string, tagId = id): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId },
    target: { type: "node-property", nodeId: `node-${id}`, property: "value" },
    mode: "one-way",
    enabled: true
  };
}

function runtime(revision: number, values: Readonly<Record<string, JsonValue>>): RuntimeSnapshot {
  return {
    revision,
    timestamp: revision,
    size: Object.keys(values).length,
    has: (key: string) => key in values,
    get: (key: string) => {
      const value = values[key];
      return value === undefined
        ? undefined
        : {
            key,
            value,
            quality: "good" as const,
            timestamp: revision,
            ingestionTimestamp: revision
          };
    },
    getAll: () => []
  };
}

describe("dependency graph", () => {
  it("uses canonical collision-safe, case-sensitive dependency keys", () => {
    expect(getBindingDependencyKey({ kind: "runtime-value", key: "A:b" })).not.toBe(
      getBindingDependencyKey({ kind: "runtime-value", key: "A" })
    );
    expect(getBindingDependencyKey({ kind: "runtime-value", key: "Tag" })).not.toBe(
      getBindingDependencyKey({ kind: "runtime-value", key: "tag" })
    );
    expect(
      normalizeBindingDependencies([
        { kind: "runtime-value", key: "x" },
        { kind: "runtime-value", key: "x" }
      ])
    ).toHaveLength(1);
  });

  it("extracts direct and AST-compiled expression dependencies", () => {
    expect(extractBindingDependencies(binding("a", "plant.temp")).dependencies).toEqual([
      { kind: "runtime-value", key: "plant.temp" }
    ]);
    const expression = {
      ...binding("expression"),
      source: { type: "expression" as const, expression: "$a + $b + $a" }
    };
    expect(extractBindingDependencies(expression).dependencies).toEqual([
      { kind: "runtime-value", key: "a" },
      { kind: "runtime-value", key: "b" }
    ]);
  });

  it("uses reverse indexes and deterministic affected order", () => {
    const graph = new BindingDependencyGraph([binding("z", "shared"), binding("a", "other")]);
    expect(graph.getDirectConsumers({ kind: "runtime-value", key: "shared" })).toEqual(["z"]);
    expect(graph.affected([{ kind: "runtime-value", key: "unknown" }])).toEqual([]);
    expect(graph.affected([{ kind: "runtime-value", key: "shared" }])).toEqual(["z"]);
    expect(graph.snapshot.topologicalBindingIds).toEqual(["a", "z"]);
  });

  it("isolates deterministic cycles when binding-output dependencies are supplied", () => {
    const definitions = [binding("a"), binding("b"), binding("independent")];
    const graph = new BindingDependencyGraph(definitions, undefined, (definition) => ({
      bindingId: definition.id,
      dependencies:
        definition.id === "a"
          ? [{ kind: "binding", bindingId: "b" }]
          : definition.id === "b"
            ? [{ kind: "binding", bindingId: "a" }]
            : [{ kind: "runtime-value", key: "safe" }],
      diagnostics: []
    }));
    expect(graph.snapshot.cyclicBindingIds).toEqual(["a", "b"]);
    expect(graph.snapshot.topologicalBindingIds).toEqual(["independent"]);
    expect(graph.snapshot.diagnostics.map(({ code }) => code)).toContain(
      "BINDING_DEPENDENCY_CYCLE"
    );
  });

  it("cleans reverse indexes on replacement and removal", () => {
    const graph = new BindingDependencyGraph([binding("a", "old")]);
    graph.replace(binding("a", "new"));
    expect(graph.getDirectConsumers({ kind: "runtime-value", key: "old" })).toEqual([]);
    expect(graph.getDirectConsumers({ kind: "runtime-value", key: "new" })).toEqual(["a"]);
    graph.remove("a");
    expect(graph.getDirectConsumers({ kind: "runtime-value", key: "new" })).toEqual([]);
  });
});

describe("incremental binding engine", () => {
  it("cold-starts all bindings then evaluates only direct consumers", () => {
    const engine = new IncrementalBindingEngine([binding("a"), binding("b")]);
    const initial = engine.evaluateAll({ runtime: runtime(1, { a: 1, b: 2 }), locale: "en-US" });
    expect(initial.statistics.evaluatedBindingCount).toBe(2);
    const changed = engine.evaluateChanges(
      { runtime: runtime(2, { a: 3, b: 2 }), locale: "en-US" },
      { revision: 2, changed: [{ kind: "runtime-value", key: "a" }] }
    );
    expect(changed.plan.orderedBindingIds).toEqual(["a"]);
    expect(changed.evaluated.map(({ bindingId }) => bindingId)).toEqual(["a"]);
    expect(changed.visualDiff.changes).toHaveLength(1);
  });

  it("returns empty work for unknown inputs and rejects stale revisions", () => {
    const engine = new IncrementalBindingEngine([binding("a")]);
    engine.evaluateAll({ runtime: runtime(1, { a: 1 }), locale: "en-US" });
    const irrelevant = engine.evaluateChanges(
      { runtime: runtime(2, { a: 1 }), locale: "en-US" },
      { revision: 2, changed: [{ kind: "runtime-value", key: "unknown" }] }
    );
    expect(irrelevant.evaluated).toEqual([]);
    expect(irrelevant.visualDiff.changes).toEqual([]);
    const stale = engine.evaluateChanges(
      { runtime: runtime(2, { a: 1 }), locale: "en-US" },
      { revision: 2, changed: [{ kind: "runtime-value", key: "a" }] }
    );
    expect(stale.diagnostics.map(({ code }) => code)).toContain("BINDING_REVISION_OUT_OF_ORDER");
    expect(stale.evaluated).toEqual([]);
  });

  it("uses exact deterministic structural output equality", () => {
    const target = binding("a").target;
    const result = (value: JsonValue): BindingEvaluationResult => ({
      bindingId: "a",
      status: "resolved" as const,
      target,
      value,
      dependencies: [],
      diagnostics: []
    });
    expect(bindingEvaluationOutputsEqual(result({ b: 2, a: 1 }), result({ a: 1, b: 2 }))).toBe(
      true
    );
    expect(bindingEvaluationOutputsEqual(result(0), result(-0))).toBe(false);
    expect(bindingEvaluationOutputsEqual(result(Number.NaN), result(Number.NaN))).toBe(true);
  });

  it("disposes idempotently and diagnoses later use", () => {
    const engine = new IncrementalBindingEngine([binding("a")]);
    engine.dispose();
    engine.dispose();
    const result = engine.evaluateAll({ runtime: runtime(1, { a: 1 }), locale: "en-US" });
    expect(result.diagnostics.map(({ code }) => code)).toContain("BINDING_ENGINE_DISPOSED");
  });
});
