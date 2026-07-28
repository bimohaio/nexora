import type { ScadaDocument, ScadaNode } from "@web-scada/core";

function node(
  id: string,
  name: string,
  symbolType: string,
  x: number,
  y: number,
  width: number,
  height: number
): ScadaNode {
  return {
    id,
    name,
    symbolType,
    transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId: "layer_process",
    visible: true,
    locked: false
  };
}

export const DESIGNER_SAMPLE_DOCUMENT: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "doc_designer_mvp",
  metadata: {
    name: "Cooling Water Designer",
    description: "Interactive Phase 4 Designer sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: ["phase-4", "designer"]
  },
  canvas: {
    width: 1400,
    height: 850,
    background: "#07111f",
    gridSize: 20,
    gridVisible: true,
    snapToGrid: true,
    coordinateUnit: "logical",
    defaultViewport: { x: 80, y: 60, zoom: 0.8 }
  },
  layers: [{ id: "layer_process", name: "Process", order: 0, visible: true, locked: false }],
  nodes: [
    {
      ...node("node_tank", "Cooling Tank", "process.vertical-tank", 120, 180, 110, 180),
      bindings: ["binding_tank_level"]
    },
    node("node_pump", "Circulation Pump", "process.centrifugal-pump", 390, 225, 120, 90),
    node("node_valve", "Isolation Valve", "process.gate-valve", 680, 235, 90, 70),
    node("node_sensor", "Flow Transmitter", "instrumentation.flow-sensor", 930, 230, 72, 72),
    node("node_plc", "Process PLC", "network-control.plc", 1080, 480, 140, 110)
  ],
  connections: [
    {
      id: "conn_tank_pump",
      name: "Tank outlet",
      source: { nodeId: "node_tank", portId: "outlet" },
      target: { nodeId: "node_pump", portId: "inlet" },
      routing: "direct",
      waypoints: [],
      medium: "water",
      direction: "forward",
      style: { stroke: "#38bdf8", strokeWidth: 5, endMarker: "arrow" },
      layerId: "layer_process",
      visible: true,
      locked: false
    },
    {
      id: "conn_pump_valve",
      name: "Pump discharge",
      source: { nodeId: "node_pump", portId: "outlet" },
      target: { nodeId: "node_valve", portId: "inlet" },
      routing: "orthogonal",
      waypoints: [],
      medium: "water",
      direction: "forward",
      style: { stroke: "#38bdf8", strokeWidth: 5, endMarker: "arrow" },
      layerId: "layer_process",
      visible: true,
      locked: false
    }
  ],
  variables: [],
  bindings: [
    {
      id: "binding_tank_level",
      source: { type: "tag", tagId: "plant.cooling.level" },
      target: { type: "node-property", nodeId: "node_tank", property: "level" },
      mode: "one-way",
      fallback: 0,
      enabled: true
    }
  ],
  runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
};
