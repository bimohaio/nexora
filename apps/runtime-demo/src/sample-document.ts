import type { ScadaDocument, ScadaNode } from "@web-scada/core";

const node = (
  id: string,
  name: string,
  symbolType: string,
  x: number,
  y: number,
  width: number,
  height: number,
  properties: ScadaNode["properties"] = {},
  layerId = "layer_process",
  bindings: readonly string[] = []
): ScadaNode => ({
  id,
  name,
  symbolType,
  transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
  properties,
  bindings,
  layerId,
  visible: true,
  locked: id === "node_motor"
});

export const WATER_TREATMENT_DOCUMENT: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "doc_phase_2_water",
  metadata: {
    name: "Water Treatment Process",
    description: "Phase 2 SVG viewer sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "web-scada",
    tags: ["water", "phase-2"]
  },
  canvas: {
    width: 1400,
    height: 800,
    background: "#07111f",
    gridSize: 25,
    gridVisible: true,
    snapToGrid: true,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [
    { id: "layer_process", name: "Process", order: 0, visible: true, locked: false },
    { id: "layer_reference", name: "Reference", order: 1, visible: false, locked: true }
  ],
  nodes: [
    node("node_title", "Process title", "basic.text", 70, 45, 560, 50, {
      text: "RAW WATER TREATMENT · LINE 01",
      fontSize: 28,
      fill: "#e2e8f0"
    }),
    node(
      "node_tank",
      "Raw Water Tank",
      "equipment.tank",
      100,
      230,
      170,
      300,
      {
        fill: "#0f4c5c",
        level: 0.68
      },
      "layer_process",
      ["binding_tank_level"]
    ),
    node(
      "node_pump",
      "Feed Pump",
      "equipment.pump",
      390,
      330,
      130,
      100,
      {
        fill: "#2563eb"
      },
      "layer_process",
      ["binding_pump_state"]
    ),
    node("node_valve", "Control Valve", "equipment.valve", 660, 345, 100, 75, {
      fill: "#0f766e"
    }),
    node("node_sensor", "Flow Sensor", "equipment.sensor", 880, 330, 80, 80, {
      code: "FT"
    }),
    node("node_motor", "Pump Motor", "equipment.motor", 380, 580, 140, 100, {
      fill: "#475569"
    }),
    node(
      "node_indicator",
      "Status Lamp",
      "equipment.indicator",
      1120,
      180,
      64,
      64,
      {
        fill: "#22c55e"
      },
      "layer_process",
      ["binding_indicator_state"]
    ),
    node(
      "node_boundary",
      "Treatment Boundary",
      "basic.rectangle",
      70,
      150,
      1100,
      470,
      {
        fill: "transparent",
        stroke: "#1e3a5f",
        strokeWidth: 2,
        labelVisible: false
      },
      "layer_reference"
    )
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
      style: { stroke: "#38bdf8", strokeWidth: 6, endMarker: "arrow" },
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
      style: { stroke: "#38bdf8", strokeWidth: 6, endMarker: "arrow" },
      layerId: "layer_process",
      visible: true,
      locked: false
    },
    {
      id: "conn_sensor_lamp",
      name: "Flow status",
      source: { nodeId: "node_sensor", portId: "signal" },
      target: { nodeId: "node_indicator", portId: "signal" },
      routing: "manual",
      waypoints: [
        { x: 1040, y: 370 },
        { x: 1040, y: 212 }
      ],
      medium: "signal",
      direction: "forward",
      style: { stroke: "#f59e0b", strokeWidth: 3, dashPattern: [8, 5] },
      layerId: "layer_process",
      visible: true,
      locked: false
    }
  ],
  variables: [],
  bindings: [
    {
      id: "binding_tank_level",
      source: { type: "tag", tagId: "process.tank.level" },
      target: { type: "node-property", nodeId: "node_tank", property: "level" },
      mode: "one-way",
      fallback: 0,
      enabled: true
    },
    {
      id: "binding_pump_state",
      source: { type: "tag", tagId: "process.pump.state" },
      target: { type: "node-state", nodeId: "node_pump" },
      mode: "one-way",
      fallback: "offline",
      enabled: true
    },
    {
      id: "binding_indicator_state",
      source: { type: "tag", tagId: "process.indicator.state" },
      target: { type: "node-state", nodeId: "node_indicator" },
      mode: "one-way",
      fallback: "offline",
      enabled: true
    },
    {
      id: "binding_flow_color",
      source: { type: "tag", tagId: "process.pipe.color" },
      target: {
        type: "connection-property",
        connectionId: "conn_pump_valve",
        property: "stroke"
      },
      mode: "one-way",
      fallback: "#94a3b8",
      enabled: true
    }
  ],
  runtimeSettings: {
    refreshInterval: 250,
    staleAfterMs: 5000,
    defaultQuality: "unknown",
    timezone: "UTC",
    locale: "en"
  }
};
