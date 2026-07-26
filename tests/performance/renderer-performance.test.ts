// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import type { ScadaConnection, ScadaDocument, ScadaNode } from "@web-scada/core";
import { createSvgRenderer } from "@web-scada/renderer-svg";
import { createExampleSymbolRegistry } from "@web-scada/symbols";

function createModerateDocument(count: number): ScadaDocument {
  const nodes: ScadaNode[] = Array.from({ length: count }, (_, index) => ({
    id: `node_${String(index)}`,
    name: `Node ${String(index)}`,
    symbolType: "basic.rectangle",
    transform: {
      x: (index % 25) * 140,
      y: Math.floor(index / 25) * 100,
      width: 100,
      height: 60,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    properties: {},
    bindings: [],
    layerId: "layer_main",
    visible: true,
    locked: false
  }));
  const connections: ScadaConnection[] = nodes.slice(1).map((node, index) => ({
    id: `conn_${String(index)}`,
    name: `Connection ${String(index)}`,
    source: { nodeId: nodes[index]?.id ?? "", portId: "outlet" },
    target: { nodeId: node.id, portId: "inlet" },
    routing: index % 2 === 0 ? "direct" : "orthogonal",
    waypoints: [],
    medium: "generic",
    direction: "forward",
    style: {},
    layerId: "layer_main",
    visible: true,
    locked: false
  }));
  return {
    schemaVersion: "1.0.0",
    id: "doc_performance",
    metadata: {
      name: "Moderate renderer fixture",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 3600,
      height: 2400,
      background: "transparent",
      gridSize: 20,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "layer_main", name: "Main", order: 0, visible: true, locked: false }],
    nodes,
    connections,
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

describe("SVG renderer moderate-document performance fixture", () => {
  it("renders 500 nodes and 499 connections without a timing assertion", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 1200 },
      clientHeight: { value: 800 }
    });
    document.body.append(container);
    const renderer = createSvgRenderer({
      symbols: createExampleSymbolRegistry(),
      options: { showPorts: false, showGrid: false }
    });
    renderer.mount(container);
    const fixture = createModerateDocument(500);
    const startedAt = performance.now();
    renderer.renderDocument(fixture);
    const elapsedMs = performance.now() - startedAt;
    expect(renderer.getSvgElement()?.querySelectorAll('[data-entity-type="node"]')).toHaveLength(
      500
    );
    expect(
      renderer.getSvgElement()?.querySelectorAll('[data-entity-type="connection"][data-hit-area]')
    ).toHaveLength(499);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    renderer.dispose();
  });
});
