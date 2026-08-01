import type { PropertyBinding, ScadaConnection, ScadaDocument, ScadaNode } from "@web-scada/core";
import { CORE_SYMBOL_TYPES, INDUSTRIAL_SYMBOL_TYPES } from "@web-scada/symbols";

const PROCESS = "layer_process";
const INSTRUMENTS = "layer_instruments";
const CONTROL = "layer_control";

function node(
  id: string,
  name: string,
  symbolType: string,
  x: number,
  y: number,
  width: number,
  height: number,
  properties: ScadaNode["properties"] = {},
  bindings: readonly string[] = [],
  layerId = PROCESS
): ScadaNode {
  return {
    id,
    name,
    symbolType,
    transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    properties,
    bindings,
    layerId,
    visible: true,
    locked: false
  };
}

function connection(
  id: string,
  name: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  medium: ScadaConnection["medium"] = "water",
  stroke = "#38bdf8"
): ScadaConnection {
  return {
    id,
    name,
    source: { nodeId: sourceNodeId, portId: sourcePortId },
    target: { nodeId: targetNodeId, portId: targetPortId },
    routing: "orthogonal",
    waypoints: [],
    medium,
    direction: "forward",
    style: { stroke, strokeWidth: medium === "signal" ? 2 : 5, endMarker: "arrow" },
    layerId: medium === "signal" ? INSTRUMENTS : PROCESS,
    visible: true,
    locked: false
  };
}

function tagProperty(
  id: string,
  tagId: string,
  nodeId: string,
  property: string,
  fallback: NonNullable<PropertyBinding["fallback"]>
): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId },
    target: { type: "node-property", nodeId, property },
    mode: "one-way",
    fallback,
    enabled: true
  };
}

function tagState(id: string, tagId: string, nodeId: string): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId },
    target: { type: "node-state", nodeId },
    mode: "one-way",
    fallback: "offline",
    enabled: true
  };
}

function tagText(id: string, tagId: string, nodeId: string, fallback: string): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId },
    target: { type: "text", nodeId },
    mode: "one-way",
    fallback,
    enabled: true
  };
}

function pipeColor(id: string, connectionId: string): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId: "process.main-pipe.color" },
    target: { type: "connection-property", connectionId, property: "stroke" },
    mode: "one-way",
    fallback: "#64748b",
    enabled: true
  };
}

const processConnections = [
  connection(
    "conn_raw_inlet",
    "Raw tank to inlet valve",
    "node_raw_tank",
    "outlet",
    "node_inlet_valve",
    "inlet"
  ),
  connection(
    "conn_inlet_pump",
    "Inlet valve to feed pump",
    "node_inlet_valve",
    "outlet",
    "node_feed_pump",
    "inlet"
  ),
  connection(
    "conn_pump_mixer",
    "Feed pump to treatment vessel",
    "node_feed_pump",
    "outlet",
    "node_mixer",
    "inlet"
  ),
  connection(
    "conn_mixer_outlet",
    "Treatment vessel to outlet valve",
    "node_mixer",
    "outlet",
    "node_outlet_valve",
    "inlet"
  ),
  connection(
    "conn_outlet_clean",
    "Outlet valve to clean tank",
    "node_outlet_valve",
    "outlet",
    "node_clean_tank",
    "inlet"
  )
] as const;

export const WATER_TREATMENT_DOCUMENT: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "doc_runtime_water_treatment",
  metadata: {
    name: "Water Treatment Runtime Process",
    description: "Industrial runtime demonstration with sensors and actuators",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    createdBy: "web-scada",
    tags: ["water", "runtime", "industrial"]
  },
  canvas: {
    width: 1800,
    height: 950,
    background: "#07111f",
    gridSize: 25,
    gridVisible: true,
    snapToGrid: true,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [
    { id: PROCESS, name: "Process", order: 0, visible: true, locked: false },
    { id: INSTRUMENTS, name: "Instrumentation", order: 1, visible: true, locked: false },
    { id: CONTROL, name: "Control", order: 2, visible: true, locked: false }
  ],
  nodes: [
    node("node_title", "Process title", CORE_SYMBOL_TYPES.text, 60, 32, 900, 48, {
      text: "WATER TREATMENT · RUNTIME CONTROL LINE",
      fontSize: 26,
      fill: "#e2e8f0"
    }),
    node(
      "node_raw_tank",
      "TK-101 Raw Water",
      INDUSTRIAL_SYMBOL_TYPES.verticalTank,
      80,
      270,
      130,
      230,
      { fill: "#164e63", level: 0.72 },
      ["binding_raw_level"]
    ),
    node(
      "node_inlet_valve",
      "XV-101 Inlet",
      INDUSTRIAL_SYMBOL_TYPES.gateValve,
      280,
      345,
      90,
      70,
      {},
      ["binding_inlet_valve"]
    ),
    node(
      "node_feed_pump",
      "P-101 Feed Pump",
      INDUSTRIAL_SYMBOL_TYPES.centrifugalPump,
      440,
      330,
      120,
      90,
      {},
      ["binding_feed_pump"]
    ),
    node("node_mixer", "MX-201 Treatment", INDUSTRIAL_SYMBOL_TYPES.mixer, 700, 275, 130, 170, {}, [
      "binding_mixer"
    ]),
    node(
      "node_outlet_valve",
      "CV-201 Outlet",
      INDUSTRIAL_SYMBOL_TYPES.butterflyValve,
      930,
      345,
      90,
      72,
      {},
      ["binding_outlet_valve"]
    ),
    node(
      "node_clean_tank",
      "TK-301 Clean Water",
      INDUSTRIAL_SYMBOL_TYPES.horizontalTank,
      1110,
      315,
      210,
      120,
      { fill: "#164e63", level: 0.58 },
      ["binding_clean_level"]
    ),
    node(
      "node_feed_motor",
      "M-101 Pump Motor",
      INDUSTRIAL_SYMBOL_TYPES.acMotor,
      445,
      520,
      110,
      90,
      {},
      ["binding_feed_motor"],
      CONTROL
    ),
    node(
      "node_flow_sensor",
      "FT-101 Flow",
      INDUSTRIAL_SYMBOL_TYPES.flowSensor,
      565,
      180,
      72,
      72,
      { code: "FT", unit: "m³/h" },
      ["binding_flow_state"],
      INSTRUMENTS
    ),
    node(
      "node_pressure_sensor",
      "PT-201 Pressure",
      INDUSTRIAL_SYMBOL_TYPES.pressureSensor,
      845,
      180,
      72,
      72,
      { code: "PT", unit: "bar" },
      ["binding_pressure_state"],
      INSTRUMENTS
    ),
    node(
      "node_temperature_sensor",
      "TT-201 Temp",
      INDUSTRIAL_SYMBOL_TYPES.temperatureSensor,
      740,
      510,
      72,
      72,
      { code: "TT", unit: "°C" },
      ["binding_temperature_state"],
      INSTRUMENTS
    ),
    node(
      "node_level_sensor",
      "LT-301 Level",
      INDUSTRIAL_SYMBOL_TYPES.levelSensor,
      1180,
      180,
      72,
      72,
      { code: "LT", unit: "%" },
      ["binding_level_state"],
      INSTRUMENTS
    ),
    node(
      "node_plc",
      "PLC-01",
      INDUSTRIAL_SYMBOL_TYPES.controller,
      1430,
      285,
      120,
      100,
      {},
      ["binding_plc_state"],
      CONTROL
    ),
    node(
      "node_alarm_beacon",
      "AL-01 Beacon",
      INDUSTRIAL_SYMBOL_TYPES.alarmBeacon,
      1480,
      130,
      72,
      90,
      {},
      ["binding_beacon_state"],
      CONTROL
    ),
    node(
      "node_flow_readout",
      "Flow readout",
      CORE_SYMBOL_TYPES.text,
      535,
      90,
      150,
      38,
      {
        text: "0.0 m³/h",
        fontSize: 18,
        fill: "#67e8f9"
      },
      ["binding_flow_text"],
      INSTRUMENTS
    ),
    node(
      "node_pressure_readout",
      "Pressure readout",
      CORE_SYMBOL_TYPES.text,
      810,
      90,
      150,
      38,
      {
        text: "0.00 bar",
        fontSize: 18,
        fill: "#fde68a"
      },
      ["binding_pressure_text"],
      INSTRUMENTS
    ),
    node(
      "node_temperature_readout",
      "Temperature readout",
      CORE_SYMBOL_TYPES.text,
      700,
      620,
      160,
      38,
      {
        text: "0.0 °C",
        fontSize: 18,
        fill: "#fdba74"
      },
      ["binding_temperature_text"],
      INSTRUMENTS
    ),
    node(
      "node_level_readout",
      "Clean level readout",
      CORE_SYMBOL_TYPES.text,
      1135,
      90,
      160,
      38,
      {
        text: "0 %",
        fontSize: 18,
        fill: "#86efac"
      },
      ["binding_level_text"],
      INSTRUMENTS
    )
  ],
  connections: [
    ...processConnections,
    connection(
      "signal_flow_plc",
      "Flow signal",
      "node_flow_sensor",
      "signal",
      "node_plc",
      "measurement",
      "signal",
      "#f59e0b"
    ),
    connection(
      "signal_pressure_plc",
      "Pressure signal",
      "node_pressure_sensor",
      "signal",
      "node_plc",
      "measurement",
      "signal",
      "#f59e0b"
    ),
    connection(
      "signal_level_plc",
      "Level signal",
      "node_level_sensor",
      "signal",
      "node_plc",
      "measurement",
      "signal",
      "#f59e0b"
    )
  ],
  variables: [],
  bindings: [
    tagProperty("binding_raw_level", "process.raw-tank.level", "node_raw_tank", "level", 0),
    tagProperty("binding_clean_level", "process.clean-tank.level", "node_clean_tank", "level", 0),
    tagState("binding_inlet_valve", "process.inlet-valve.state", "node_inlet_valve"),
    tagState("binding_feed_pump", "process.feed-pump.state", "node_feed_pump"),
    tagState("binding_mixer", "process.mixer.state", "node_mixer"),
    tagState("binding_outlet_valve", "process.outlet-valve.state", "node_outlet_valve"),
    tagState("binding_feed_motor", "process.feed-motor.state", "node_feed_motor"),
    tagState("binding_flow_state", "process.flow.state", "node_flow_sensor"),
    tagState("binding_pressure_state", "process.pressure.state", "node_pressure_sensor"),
    tagState("binding_temperature_state", "process.temperature.state", "node_temperature_sensor"),
    tagState("binding_level_state", "process.clean-level.state", "node_level_sensor"),
    tagState("binding_plc_state", "control.plc.state", "node_plc"),
    tagState("binding_beacon_state", "control.beacon.state", "node_alarm_beacon"),
    tagText("binding_flow_text", "process.flow.text", "node_flow_readout", "0.0 m³/h"),
    tagText("binding_pressure_text", "process.pressure.text", "node_pressure_readout", "0.00 bar"),
    tagText(
      "binding_temperature_text",
      "process.temperature.text",
      "node_temperature_readout",
      "0.0 °C"
    ),
    tagText("binding_level_text", "process.clean-level.text", "node_level_readout", "0 %"),
    ...processConnections.map(({ id }, index) => pipeColor(`binding_pipe_${String(index + 1)}`, id))
  ],
  runtimeSettings: {
    refreshInterval: 200,
    staleAfterMs: 5000,
    defaultQuality: "unknown",
    timezone: "UTC",
    locale: "en"
  }
};
