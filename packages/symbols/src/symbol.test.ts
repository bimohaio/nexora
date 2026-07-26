import { describe, expect, it } from "vitest";

import { InMemorySymbolRegistry, type SymbolDefinition } from "./index.js";

const definition: SymbolDefinition = {
  type: "example.indicator",
  displayNameKey: "symbols.exampleIndicator",
  category: "indicator",
  defaultWidth: 80,
  defaultHeight: 40,
  minimumWidth: 20,
  minimumHeight: 20,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal", "alarm"]
};

describe("InMemorySymbolRegistry", () => {
  it("registers, queries, filters, and unregisters definitions", () => {
    const registry = new InMemorySymbolRegistry();
    registry.register(definition);
    expect(registry.has(definition.type)).toBe(true);
    expect(registry.getByCategory("indicator")).toEqual([definition]);
    expect(registry.unregister(definition.type)).toBe(true);
    expect(registry.getAll()).toEqual([]);
    registry.register(definition);
    registry.clear();
    expect(registry.getAll()).toEqual([]);
  });

  it("rejects duplicate symbol types", () => {
    const registry = new InMemorySymbolRegistry();
    registry.register(definition);
    expect(() => {
      registry.register(definition);
    }).toThrow("already registered");
  });

  it("rejects invalid normalized port positions", () => {
    const registry = new InMemorySymbolRegistry();
    expect(() => {
      registry.register({
        ...definition,
        type: "invalid",
        ports: [
          {
            id: "bad",
            label: "Bad",
            position: { x: 2, y: 0 },
            direction: "passive",
            medium: "generic",
            acceptedMediums: [],
            acceptedDirections: []
          }
        ]
      });
    }).toThrow("Invalid port position");
  });
});
