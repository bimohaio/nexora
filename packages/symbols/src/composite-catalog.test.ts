import { describe, expect, it } from "vitest";
import type { ScadaDocument } from "@web-scada/core";
import {
  COMPOSITE_CATALOG,
  COMPOSITE_SYMBOLS,
  canonicalizeDocumentSymbolTypes,
  createIndustrialSymbolRegistry,
  createStandardSymbolCategoryRegistry
} from "./index.js";

function documentWithType(symbolType: string): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "catalog-migration",
    metadata: {
      name: "Catalog migration",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 800,
      height: 600,
      background: "transparent",
      gridSize: 10,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
    nodes: [
      {
        id: "node-1",
        name: "Pump",
        symbolType,
        transform: {
          x: 10,
          y: 20,
          width: 120,
          height: 90,
          rotation: 15,
          scaleX: -1,
          scaleY: 1
        },
        properties: { unknownLegacyValue: "preserved" },
        bindings: ["binding-1"],
        layerId: "main",
        visible: true,
        locked: false,
        extensions: { interaction: "preserved" }
      }
    ],
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

describe("composite symbol catalog", () => {
  it("contains every required Section 17 entry in all 17 stable categories", () => {
    expect(COMPOSITE_CATALOG).toHaveLength(378);
    expect(COMPOSITE_SYMBOLS).toHaveLength(378);
    expect(new Set(COMPOSITE_CATALOG.map(({ type }) => type)).size).toBe(378);
    expect(new Set(COMPOSITE_CATALOG.map(({ category }) => category)).size).toBe(17);
    const categories = createStandardSymbolCategoryRegistry();
    for (const entry of COMPOSITE_CATALOG) expect(categories.get(entry.category)).toBeDefined();
  });

  it("registers immutable valid definitions with stable variants, anchors, and defaults", () => {
    const registry = createIndustrialSymbolRegistry();
    expect(registry.getAll()).toHaveLength(428);
    expect(registry.validate()).toEqual({ valid: true, diagnostics: [] });
    for (const definition of COMPOSITE_SYMBOLS) {
      expect(registry.validateDefinition(definition).valid).toBe(true);
      expect(Object.isFrozen(registry.require(definition.type))).toBe(true);
      expect(definition.variants?.map(({ id }) => id)).toEqual(["horizontal", "vertical"]);
      expect(definition.defaultWidth).toBeGreaterThanOrEqual(definition.minimumWidth);
      expect(definition.defaultHeight).toBeGreaterThanOrEqual(definition.minimumHeight);
      expect(new Set(definition.ports.map(({ id }) => id)).size).toBe(definition.ports.length);
    }
  });

  it("canonicalizes aliases idempotently while preserving document semantics", () => {
    const registry = createIndustrialSymbolRegistry();
    const legacy = documentWithType("pump.centrifugal");
    const migrated = canonicalizeDocumentSymbolTypes(legacy, registry);
    expect(migrated).not.toBe(legacy);
    expect(migrated.nodes[0]?.symbolType).toBe("process.centrifugal-pump");
    expect(migrated.nodes[0]?.id).toBe("node-1");
    expect(migrated.nodes[0]?.transform).toBe(legacy.nodes[0]?.transform);
    expect(migrated.nodes[0]?.properties).toBe(legacy.nodes[0]?.properties);
    expect(migrated.nodes[0]?.bindings).toBe(legacy.nodes[0]?.bindings);
    expect(canonicalizeDocumentSymbolTypes(migrated, registry)).toBe(migrated);
  });
});
