// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { COMPOSITE_CATALOG, createIndustrialSymbolRegistry } from "@web-scada/symbols";
import { createInitialSvgSymbolRendererRegistry } from "./symbol-renderers.js";
import type { ScadaDocument, ScadaNode } from "@web-scada/core";

const baseDocument: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "composite-render-test",
  metadata: {
    name: "Composite render test",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 200,
    height: 160,
    background: "transparent",
    gridSize: 10,
    gridVisible: false,
    snapToGrid: false,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
  nodes: [],
  connections: [],
  variables: [],
  bindings: [],
  runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
};

function node(symbolType: string, width: number, height: number): ScadaNode {
  return {
    id: "node-1",
    name: symbolType,
    symbolType,
    transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId: "main",
    visible: true,
    locked: false
  };
}

describe("composite SVG visual families", () => {
  it("registers and renders every canonical catalog visual without fallback", () => {
    const symbols = createIndustrialSymbolRegistry();
    const visuals = createInitialSvgSymbolRendererRegistry();
    expect(visuals.validateAgainst(symbols)).toEqual({
      valid: true,
      missingVisuals: [],
      orphanVisuals: []
    });
    for (const entry of COMPOSITE_CATALOG) {
      const definition = symbols.require(entry.type);
      const renderer = visuals.get(entry.type);
      expect(renderer, entry.type).toBeDefined();
      if (renderer === undefined) throw new Error(`Missing renderer: ${entry.type}`);
      const element = renderer.create({
        document: baseDocument,
        node: node(entry.type, definition.defaultWidth, definition.defaultHeight),
        state: "normal"
      });
      expect(element.children.length, entry.type).toBeGreaterThan(0);
      expect(element.textContent).not.toContain("undefined");
      renderer.dispose?.(element);
      expect(element.children.length).toBe(0);
    }
  });

  it("uses distinct vector family geometry and applies operational states", () => {
    const visuals = createInitialSvgSymbolRendererRegistry();
    const samples = [
      "indicator.lamp",
      "valve.gate-valve",
      "pump.gear-pump",
      "vessel.vertical-tank",
      "instrument.pressure-gauge",
      "automation.robot-arm"
    ];
    const markup = samples.map((type) => {
      const renderer = visuals.get(type);
      const element = renderer?.create({
        document: baseDocument,
        node: node(type, 120, 90),
        state: "alarm"
      });
      return element?.innerHTML;
    });
    expect(new Set(markup).size).toBe(samples.length);
    for (const value of markup) expect(value).toContain("#dc2626");
  });
});
