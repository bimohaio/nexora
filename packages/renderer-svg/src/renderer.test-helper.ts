import type { ScadaDocument, ScadaNode } from "@web-scada/core";

export function createRendererTestDocument(): ScadaDocument {
  const node = (
    id: string,
    symbolType: string,
    x: number,
    y: number,
    layerId = "layer_process"
  ): ScadaNode => ({
    id,
    name: id,
    symbolType,
    transform: { x, y, width: 100, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId,
    visible: true,
    locked: id === "node_locked"
  });
  return {
    schemaVersion: "1.0.0",
    id: "doc_renderer",
    metadata: {
      name: "Renderer Test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 1000,
      height: 600,
      background: "#07111f",
      gridSize: 20,
      gridVisible: true,
      snapToGrid: true,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [
      { id: "layer_process", name: "Process", order: 0, visible: true, locked: false },
      { id: "layer_hidden", name: "Hidden", order: 1, visible: false, locked: true }
    ],
    nodes: [
      node("node_a", "basic.rectangle", 40, 100),
      node("node_b", "equipment.pump", 300, 100),
      node("node_locked", "equipment.valve", 560, 100),
      node("node_hidden", "equipment.sensor", 100, 400, "layer_hidden"),
      node("node_missing", "vendor.missing", 760, 100)
    ],
    connections: [
      {
        id: "conn_direct",
        name: "Direct",
        source: { nodeId: "node_a", portId: "outlet" },
        target: { nodeId: "node_b", portId: "inlet" },
        routing: "direct",
        waypoints: [],
        medium: "water",
        direction: "forward",
        style: { stroke: "#38bdf8", strokeWidth: 4 },
        layerId: "layer_process",
        visible: true,
        locked: false
      },
      {
        id: "conn_orthogonal",
        name: "Orthogonal",
        source: { nodeId: "node_b", portId: "outlet" },
        target: { nodeId: "node_locked", portId: "inlet" },
        routing: "orthogonal",
        waypoints: [],
        medium: "water",
        direction: "forward",
        style: { stroke: "#22c55e" },
        layerId: "layer_process",
        visible: true,
        locked: false
      },
      {
        id: "conn_manual",
        name: "Manual",
        source: { nodeId: "node_a", portId: "outlet" },
        target: { nodeId: "node_locked", portId: "inlet" },
        routing: "manual",
        waypoints: [
          { x: 180, y: 280 },
          { x: 500, y: 280 }
        ],
        medium: "generic",
        direction: "bidirectional",
        style: { stroke: "#f59e0b", dashPattern: [8, 4] },
        layerId: "layer_process",
        visible: true,
        locked: false
      }
    ],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}
