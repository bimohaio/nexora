import { describe, expect, it } from "vitest";
import {
  createScadaDocument,
  parseDocumentJson,
  serializeDocumentJson,
  type PropertyBinding
} from "@web-scada/core";
import {
  BindingTypeRegistry,
  DuplicateBindingTypeError,
  getBindingDependencies,
  getBindingDependencyKey,
  normalizeBindingDefinition,
  normalizeBindingDependencies,
  validateBindingDefinition
} from "./index.js";

const binding: PropertyBinding = {
  id: "binding-pump-active",
  source: { type: "tag", tagId: "plant.line1.pump.running" },
  target: { type: "node-state", nodeId: "node_pump_01" },
  mode: "one-way",
  fallback: false,
  enabled: true,
  extensions: { "plugin.example": { retained: true } }
};

describe("binding contracts", () => {
  it("creates deterministic, distinct dependency identities and normalization", () => {
    const runtime = { kind: "runtime-value", key: "a:b" } as const;
    const bindingReference = { kind: "binding", bindingId: "a:b" } as const;
    expect(getBindingDependencyKey(runtime)).not.toBe(getBindingDependencyKey(bindingReference));
    expect(normalizeBindingDependencies([runtime, bindingReference, runtime])).toHaveLength(2);
    expect(getBindingDependencies(binding)).toEqual([
      { kind: "runtime-value", key: "plant.line1.pump.running" }
    ]);
  });

  it("normalizes without mutating caller data and preserves extensions", () => {
    const input = { ...binding, id: " binding-pump-active " };
    const before = JSON.stringify(input);
    const normalized = normalizeBindingDefinition(input);
    expect(normalized.id).toBe("binding-pump-active");
    expect(normalized.extensions).toEqual(binding.extensions);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps expression text inert", () => {
    const expression = {
      ...binding,
      source: { type: "expression", expression: "globalThis.compromised = true" }
    } as const;
    expect(validateBindingDefinition(expression).valid).toBe(true);
    expect(expression.source.expression).toContain("globalThis");
  });

  it("rejects non-JSON values", () => {
    const invalid = { ...binding, extensions: { unsafe: (() => true) as never } };
    expect(validateBindingDefinition(invalid).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "BINDING_INVALID_DEFINITION" })])
    );
  });
});

describe("binding type registry", () => {
  it("supports isolated deterministic registries and aliases", () => {
    const first = new BindingTypeRegistry();
    const second = new BindingTypeRegistry();
    first.register({ type: "direct", aliases: ["tag"] });
    first.register({ type: "expression" });
    expect(first.get("tag")?.type).toBe("direct");
    expect(first.list().map(({ type }) => type)).toEqual(["direct", "expression"]);
    expect(second.list()).toEqual([]);
    expect(() => {
      first.register({ type: "direct" });
    }).toThrow(DuplicateBindingTypeError);
  });
});

describe("core integration", () => {
  it("round trips JSON-safe binding fields through the document pipeline", () => {
    const base = createScadaDocument({ name: "Binding fixture" });
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
          bindings: [binding.id],
          layerId: base.layers[0]?.id ?? "",
          visible: true,
          locked: false
        }
      ],
      bindings: [binding]
    };
    const serialized = serializeDocumentJson(document);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    const parsed = parseDocumentJson(serialized.json);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.document.bindings).toEqual([binding]);
  });

  it("rejects unknown source discriminators without executing them", () => {
    const base = createScadaDocument({ name: "Invalid binding" });
    const candidate = {
      ...base,
      bindings: [{ ...binding, source: { type: "plugin.execute", expression: "alert(1)" } }]
    };
    expect(parseDocumentJson(JSON.stringify(candidate)).success).toBe(false);
  });
});
