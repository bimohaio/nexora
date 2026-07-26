import { describe, expect, it } from "vitest";

import { InMemorySymbolRegistry, type SymbolDefinition } from "./index.js";

const definition: SymbolDefinition = {
  type: "example.indicator",
  displayNameKey: "symbols.exampleIndicator",
  category: "examples",
  defaultWidth: 80,
  defaultHeight: 40,
  minimumWidth: 20,
  minimumHeight: 20,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal", "alarm"],
  rendererId: "example-indicator"
};

describe("InMemorySymbolRegistry", () => {
  it("registers, queries, filters, and unregisters definitions", () => {
    const registry = new InMemorySymbolRegistry();
    registry.register(definition);
    expect(registry.has(definition.type)).toBe(true);
    expect(registry.getByCategory("examples")).toEqual([definition]);
    expect(registry.unregister(definition.type)).toBe(true);
    expect(registry.getAll()).toEqual([]);
  });

  it("rejects duplicate symbol types", () => {
    const registry = new InMemorySymbolRegistry();
    registry.register(definition);
    expect(() => {
      registry.register(definition);
    }).toThrow("already registered");
  });
});
