import type { BindingTarget } from "@web-scada/core";
import { describe, expect, it } from "vitest";
import type { BindingEvaluationResult } from "./contracts.js";
import {
  createBuiltInVisualPropertyRegistry,
  DuplicateVisualPropertyError,
  getVisualTargetKey,
  normalizeBindingTarget,
  validateVisualPropertyTarget,
  VisualPropertyRegistry,
  VisualPropertyResolver,
  type VisualPropertyCandidate,
  type VisualPropertyTarget
} from "./visual-properties.js";

const target = (property: string, kind: "node" | "connection" = "node"): VisualPropertyTarget => ({
  kind,
  targetId: kind === "node" ? "pump-1" : "pipe-1",
  property
});

function result(
  bindingId: string,
  value: unknown,
  status: BindingEvaluationResult["status"] = "resolved"
): BindingEvaluationResult {
  return {
    bindingId,
    status,
    target: { type: "node-property", nodeId: "pump-1", property: "fill" },
    ...(value === undefined ? {} : { value: value as never }),
    dependencies: [],
    diagnostics: []
  };
}

function candidate(
  bindingId: string,
  property: string,
  value: unknown,
  extras: Partial<VisualPropertyCandidate> = {}
): VisualPropertyCandidate {
  return {
    bindingId,
    target: target(property),
    result: result(bindingId, value),
    ...extras
  };
}

describe("visual property targets and registry", () => {
  it("normalizes every persisted target without changing the serialized shape", () => {
    const cases: readonly [BindingTarget, VisualPropertyTarget | undefined][] = [
      [
        { type: "node-property", nodeId: "n", property: "level" },
        { kind: "node", targetId: "n", property: "level" }
      ],
      [
        { type: "connection-property", connectionId: "c", property: "flow" },
        { kind: "connection", targetId: "c", property: "flow" }
      ],
      [
        { type: "node-state", nodeId: "n" },
        { kind: "node", targetId: "n", property: "status" }
      ],
      [
        { type: "text", nodeId: "n" },
        { kind: "node", targetId: "n", property: "text" }
      ],
      [
        { type: "visibility", entityId: "c" },
        { kind: "connection", targetId: "c", property: "visible" }
      ]
    ];
    for (const [input, expected] of cases)
      expect(normalizeBindingTarget(input, "connection")).toEqual(expected);
  });

  it("uses unambiguous deterministic keys and rejects unsafe or unknown paths", () => {
    expect(getVisualTargetKey({ kind: "node", targetId: "a:b", property: "fill" })).toBe(
      "node:3:a:b"
    );
    const registry = createBuiltInVisualPropertyRegistry();
    expect(
      validateVisualPropertyTarget(
        { kind: "node", targetId: "n", property: "__proto__.polluted" },
        registry
      )[0]?.code
    ).toBe("UNSAFE_VISUAL_TARGET");
    expect(validateVisualPropertyTarget(target("unknown"), registry)[0]?.code).toBe(
      "UNKNOWN_VISUAL_PROPERTY"
    );
    expect(validateVisualPropertyTarget(target("fill", "connection"), registry)[0]?.code).toBe(
      "UNSUPPORTED_VISUAL_TARGET"
    );
  });

  it("isolates registry instances and immutable descriptor views", () => {
    const left = new VisualPropertyRegistry();
    const right = new VisualPropertyRegistry();
    left.register({ name: "custom", acceptedTypes: ["string"], targetKinds: ["node"] });
    expect(right.get("custom")).toBeUndefined();
    expect(Object.isFrozen(left.list())).toBe(true);
    expect(() => {
      left.register({ name: "custom", acceptedTypes: ["string"], targetKinds: ["node"] });
    }).toThrow(DuplicateVisualPropertyError);
  });
});

describe("visual property resolution", () => {
  it("validates types, ranges, enum values, and unsafe colors independently", () => {
    const resolver = new VisualPropertyResolver();
    const output = resolver.resolve([
      candidate("a", "visible", "yes"),
      candidate("b", "opacity", 2),
      candidate("c", "fill", "url(javascript:alert(1))"),
      candidate("d", "status", "exploded"),
      candidate("e", "text", "<script>alert(1)</script>")
    ]);
    expect(output.diagnostics.map(({ code }) => code)).toEqual([
      "INVALID_VISUAL_PROPERTY_TYPE",
      "INVALID_VISUAL_PROPERTY_RANGE",
      "UNSAFE_VISUAL_COLOR",
      "INVALID_VISUAL_PROPERTY_TYPE"
    ]);
    expect(output.snapshot.targets.get("node:6:pump-1")?.properties).toEqual({
      text: "<script>alert(1)</script>"
    });
  });

  it("rejects non-JSON, cyclic, and non-finite evaluator output without throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const resolver = new VisualPropertyResolver();
    const output = resolver.resolve([
      candidate("function", "value", () => true),
      candidate("cyclic", "direction", cyclic),
      candidate("infinite", "speed", Number.POSITIVE_INFINITY)
    ]);
    expect(output.diagnostics.map(({ code }) => code)).toEqual([
      "INVALID_VISUAL_PROPERTY_TYPE",
      "INVALID_VISUAL_PROPERTY_TYPE",
      "INVALID_VISUAL_PROPERTY_TYPE"
    ]);
    expect(output.snapshot.targets.get("node:6:pump-1")?.properties).toEqual({});
  });

  it("uses explicit priority then declaration order then binding ID", () => {
    const resolver = new VisualPropertyResolver();
    const output = resolver.resolve([
      candidate("z", "fill", "#000", { priority: 1, declarationOrder: 1 }),
      candidate("a", "fill", "#fff", { priority: 2, declarationOrder: 4 }),
      candidate("b", "fill", "#f00", { priority: 2, declarationOrder: 2 })
    ]);
    expect(output.snapshot.targets.get("node:6:pump-1")?.properties.fill).toBe("#f00");

    const conflict = resolver.resolve([
      candidate("z", "fill", "#000"),
      candidate("a", "fill", "#fff")
    ]);
    expect(conflict.snapshot.targets.get("node:6:pump-1")?.properties.fill).toBe("#fff");
    expect(conflict.diagnostics.some(({ code }) => code === "CONFLICTING_VISUAL_BINDINGS")).toBe(
      true
    );
  });

  it("falls back to copied design values without mutating inputs", () => {
    const design = { fill: "#777", value: { nested: true } } as const;
    const values = new Map([["node:6:pump-1", design]]);
    const resolver = new VisualPropertyResolver();
    const output = resolver.resolve(
      [
        {
          ...candidate("a", "fill", undefined),
          result: result("a", undefined, "unresolved")
        }
      ],
      values
    );
    expect(output.snapshot.targets.get("node:6:pump-1")?.properties.fill).toBe("#777");
    expect(design).toEqual({ fill: "#777", value: { nested: true } });
  });

  it("emits minimal diffs with JSON equality and preserves missing versus null", () => {
    const resolver = new VisualPropertyResolver();
    expect(resolver.resolve([candidate("a", "value", { x: 1 })]).changeSet.changes[0]?.kind).toBe(
      "added"
    );
    expect(resolver.resolve([candidate("a", "value", { x: 1 })]).changeSet.changes).toEqual([]);
    expect(resolver.resolve([candidate("a", "value", null)]).changeSet.changes[0]?.kind).toBe(
      "updated"
    );
    expect(resolver.resolve([]).changeSet.changes[0]?.kind).toBe("removed");
  });

  it("does not share state between resolver instances", () => {
    const left = new VisualPropertyResolver();
    const right = new VisualPropertyResolver();
    left.resolve([candidate("a", "level", 72.5)]);
    expect(left.snapshot.targets.size).toBe(1);
    expect(right.snapshot.targets.size).toBe(0);
    left.reset();
    expect(left.snapshot.revision).toBe(0);
  });
});
