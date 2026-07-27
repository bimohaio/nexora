import type { ScadaDocument, ScadaNode } from "@web-scada/core";

export function createDesignerTestDocument(nodeCount: number): ScadaDocument {
  const nodes: ScadaNode[] = Array.from({ length: nodeCount }, (_value, index) => ({
    id: `node_${String(index)}`,
    name: `Node ${String(index)}`,
    symbolType: "process.vertical-tank",
    transform: {
      x: index * 150,
      y: index * 25,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    properties: {},
    bindings: [],
    layerId: "layer",
    visible: true,
    locked: false
  }));
  return {
    schemaVersion: "1.0.0",
    id: "doc_designer_phase5",
    metadata: {
      name: "Phase 5 test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 1000,
      height: 800,
      background: "#fff",
      gridSize: 10,
      gridVisible: true,
      snapToGrid: true,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "layer", name: "Layer", order: 0, visible: true, locked: false }],
    nodes,
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}
