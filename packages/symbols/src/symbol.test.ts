import { describe, expect, it } from "vitest";

import {
  INDUSTRIAL_SYMBOLS,
  InMemorySymbolRegistry,
  createIndustrialSymbolRegistry,
  type SymbolDefinition
} from "./index.js";

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

  it("resolves aliases deterministically and removes them with their definition", () => {
    const registry = new InMemorySymbolRegistry();
    const aliasedDefinition: SymbolDefinition = {
      ...definition,
      aliases: ["legacy.indicator", "vendor.indicator"]
    };
    registry.register(aliasedDefinition);
    expect(registry.get("legacy.indicator")).toBe(aliasedDefinition);
    expect(registry.getCanonicalType("vendor.indicator")).toBe(definition.type);
    expect(registry.getAliases(definition.type)).toEqual(["legacy.indicator", "vendor.indicator"]);
    expect(registry.isAlias("legacy.indicator")).toBe(true);
    expect(registry.unregister("legacy.indicator")).toBe(true);
    expect(registry.has(definition.type)).toBe(false);
    expect(registry.has("vendor.indicator")).toBe(false);
  });

  it("rejects alias collisions and inconsistent runtime capabilities", () => {
    const registry = new InMemorySymbolRegistry();
    registry.register({ ...definition, aliases: ["legacy.indicator"] });
    expect(() => {
      registry.register({
        ...definition,
        type: "example.other",
        aliases: ["legacy.indicator"]
      });
    }).toThrow("alias is already registered");
    expect(() => {
      registry.register({
        ...definition,
        type: "example.runtime",
        runtimeCapabilities: ["running"]
      });
    }).toThrow("included in supported states");
  });

  it("provides a complete renderer-independent industrial catalog", () => {
    const registry = createIndustrialSymbolRegistry();
    expect(INDUSTRIAL_SYMBOLS).toHaveLength(37);
    for (const category of [
      "process",
      "instrumentation",
      "electrical",
      "bms",
      "safety",
      "network-control"
    ])
      expect(registry.getByCategory(category).length).toBeGreaterThan(0);
    for (const symbol of INDUSTRIAL_SYMBOLS) {
      expect(symbol.aliases?.length).toBeGreaterThan(0);
      expect(symbol.runtimeCapabilities?.length).toBeGreaterThan(0);
      expect(new Set(symbol.ports.map(({ id }) => id)).size).toBe(symbol.ports.length);
      for (const port of symbol.ports) {
        expect(port.position.x).toBeGreaterThanOrEqual(0);
        expect(port.position.x).toBeLessThanOrEqual(1);
        expect(port.position.y).toBeGreaterThanOrEqual(0);
        expect(port.position.y).toBeLessThanOrEqual(1);
      }
      expect(JSON.stringify(symbol)).not.toMatch(/SVG|HTMLElement|Document/);
    }
  });
});
