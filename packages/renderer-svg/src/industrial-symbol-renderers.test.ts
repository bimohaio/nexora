// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import type { ScadaDocument, ScadaNode } from "@web-scada/core";
import {
  INDUSTRIAL_SYMBOLS,
  INDUSTRIAL_SYMBOL_TYPES,
  InMemorySymbolRegistry,
  createIndustrialSymbolRegistry
} from "@web-scada/symbols";
import {
  createInitialSvgSymbolRendererRegistry,
  createSvgRenderer,
  type RendererEvent,
  type SvgSymbolRenderer
} from "./index.js";

function container(): HTMLDivElement {
  const result = document.createElement("div");
  Object.defineProperties(result, {
    clientWidth: { value: 1200 },
    clientHeight: { value: 800 }
  });
  document.body.append(result);
  return result;
}

function catalogDocument(): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "industrial_catalog",
    metadata: {
      name: "Industrial catalog",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 1400,
      height: 1000,
      background: "transparent",
      gridSize: 20,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "catalog", name: "Catalog", order: 0, visible: true, locked: false }],
    nodes: INDUSTRIAL_SYMBOLS.map((definition, index) => ({
      id: `node_${String(index)}`,
      name: definition.type,
      symbolType: definition.type,
      transform: {
        x: (index % 8) * 165,
        y: Math.floor(index / 8) * 190,
        width: definition.defaultWidth,
        height: definition.defaultHeight,
        rotation: 0,
        scaleX: 1,
        scaleY: 1
      },
      properties: { labelVisible: false },
      bindings: [],
      layerId: "catalog",
      visible: true,
      locked: false
    })),
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

function requiredNode(source: ScadaDocument, index: number): ScadaNode {
  const node = source.nodes[index];
  if (node === undefined) throw new Error(`Catalog node ${String(index)} was not found.`);
  return node;
}

describe("industrial SVG symbol visuals", () => {
  it("keeps the generic and SVG registries consistent", () => {
    const symbols = createIndustrialSymbolRegistry();
    const visuals = createInitialSvgSymbolRendererRegistry();
    expect(visuals.validateAgainst(symbols)).toEqual({
      valid: true,
      missingVisuals: [],
      orphanVisuals: []
    });
    expect(Object.isFrozen(visuals.list())).toBe(true);
  });

  it("creates and updates every industrial visual in node-local coordinates", () => {
    const renderer = createSvgRenderer({ symbols: createIndustrialSymbolRegistry() });
    renderer.mount(container());
    const source = catalogDocument();
    renderer.renderDocument(source);
    expect(renderer.getSvgElement()?.querySelectorAll("[data-scada-symbol]")).toHaveLength(42);
    for (const [index, definition] of INDUSTRIAL_SYMBOLS.entries()) {
      const node = renderer.getElementForNode(`node_${String(index)}`);
      const visual = node?.querySelector<SVGGElement>("g[data-scada-symbol]");
      expect(visual?.dataset.scadaRendererType).toBe(definition.type);
      expect(visual?.getAttribute("transform")).toBeNull();
    }
    const unchanged = renderer.getElementForNode("node_1");
    renderer.refreshRuntimeStates(["node_0"]);
    expect(renderer.getElementForNode("node_1")).toBe(unchanged);
  });

  it("resolves canonical visuals through aliases and keeps fallbacks safe", () => {
    const events: RendererEvent[] = [];
    const registry = createIndustrialSymbolRegistry();
    const source = catalogDocument();
    const aliasDocument: ScadaDocument = {
      ...source,
      nodes: [
        {
          ...requiredNode(source, 0),
          symbolType: "pump.centrifugal"
        },
        {
          ...requiredNode(source, 1),
          id: "unknown",
          symbolType: "vendor.unknown"
        }
      ]
    };
    const renderer = createSvgRenderer({
      symbols: registry,
      onEvent: (event) => {
        events.push(event);
      }
    });
    renderer.mount(container());
    renderer.renderDocument(aliasDocument);
    expect(
      renderer.getElementForNode("node_0")?.querySelector<SVGGElement>("[data-scada-symbol]")
        ?.dataset.scadaRendererType
    ).toBe(INDUSTRIAL_SYMBOL_TYPES.centrifugalPump);
    expect(renderer.getElementForNode("unknown")?.textContent).toContain("vendor.unknown");
    expect(
      events.some(
        ({ type, metadata }) => type === "symbol-renderer-missing" && metadata.nodeId === "node_0"
      )
    ).toBe(false);
    expect(events.some(({ type }) => type === "symbol-metadata-missing")).toBe(true);
  });

  it("calls the optional visual disposal lifecycle", () => {
    const dispose = vi.fn();
    const visual: SvgSymbolRenderer = {
      create: () => document.createElementNS("http://www.w3.org/2000/svg", "g"),
      update: () => undefined,
      dispose
    };
    const visuals = createInitialSvgSymbolRendererRegistry();
    visuals.register("custom.visual", visual);
    const registry = new InMemorySymbolRegistry();
    registry.register({
      type: "custom.visual",
      displayNameKey: "custom.visual",
      category: "custom",
      defaultWidth: 80,
      defaultHeight: 60,
      minimumWidth: 20,
      minimumHeight: 20,
      ports: [],
      editableProperties: [],
      bindableProperties: [],
      supportedStates: ["normal"]
    });
    const source = catalogDocument();
    const renderer = createSvgRenderer({ symbols: registry, symbolRenderers: visuals });
    renderer.mount(container());
    renderer.renderDocument({
      ...source,
      nodes: [{ ...requiredNode(source, 0), symbolType: "custom.visual" }]
    });
    expect(renderer.getSvgElement()?.querySelector("[data-scada-symbol]")).not.toBeNull();
    renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
