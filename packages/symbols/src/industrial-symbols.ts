import type { Medium, PortDefinition } from "@web-scada/core";
import type {
  PropertyMetadata,
  SymbolCategory,
  SymbolDefinition,
  SymbolRuntimeCapability,
  SymbolState
} from "./symbol.js";
import {
  createBuiltInSymbolAnimationMetadata,
  type BuiltInSymbolAnimationProfile
} from "./animation-metadata.js";
import { defineSymbolPack, type SymbolPack } from "./architecture.js";

const ALL_OPERATIONAL_STATES: readonly SymbolState[] = [
  "normal",
  "active",
  "inactive",
  "running",
  "stopped",
  "warning",
  "alarm",
  "offline",
  "disabled"
];

const ALL_RUNTIME_CAPABILITIES: readonly SymbolRuntimeCapability[] = [
  "active",
  "inactive",
  "running",
  "stopped",
  "warning",
  "alarm",
  "offline",
  "disabled"
];

const COMMON_PROPERTIES: readonly PropertyMetadata[] = [
  {
    key: "fill",
    labelKey: "properties.fill",
    kind: "color",
    defaultValue: "#475569",
    bindable: true,
    group: "appearance",
    order: 10
  },
  {
    key: "stroke",
    labelKey: "properties.stroke",
    kind: "color",
    defaultValue: "#0f172a",
    group: "appearance",
    order: 20
  },
  {
    key: "strokeWidth",
    labelKey: "properties.strokeWidth",
    kind: "number",
    defaultValue: 2,
    minimum: 0.5,
    maximum: 12,
    step: 0.5,
    group: "appearance",
    order: 30
  },
  {
    key: "labelVisible",
    labelKey: "properties.labelVisible",
    kind: "boolean",
    defaultValue: true,
    group: "label",
    order: 40
  }
];

function port(
  id: string,
  label: string,
  x: number,
  y: number,
  direction: PortDefinition["direction"],
  medium: Medium
): PortDefinition {
  return {
    id,
    label,
    position: { x, y },
    direction,
    medium,
    acceptedMediums: [],
    acceptedDirections:
      direction === "output"
        ? ["input", "bidirectional"]
        : direction === "input"
          ? ["output", "bidirectional"]
          : direction === "passive"
            ? ["passive"]
            : ["input", "output", "bidirectional"]
  };
}

const PROCESS_PORTS: readonly PortDefinition[] = [
  port("inlet", "Inlet", 0, 0.5, "input", "generic"),
  port("outlet", "Outlet", 1, 0.5, "output", "generic")
];
const ELECTRICAL_PORTS: readonly PortDefinition[] = [
  port("line-in", "Line in", 0, 0.5, "input", "electricity"),
  port("line-out", "Line out", 1, 0.5, "output", "electricity")
];
const SIGNAL_PORTS: readonly PortDefinition[] = [
  port("process", "Process", 0.5, 1, "input", "generic"),
  port("signal", "Signal", 1, 0.5, "output", "signal")
];
const NETWORK_PORTS: readonly PortDefinition[] = [
  port("network-in", "Network in", 0, 0.5, "bidirectional", "network"),
  port("network-out", "Network out", 1, 0.5, "bidirectional", "network")
];

interface IndustrialSymbolOptions {
  readonly type: string;
  readonly category: SymbolCategory;
  readonly width: number;
  readonly height: number;
  readonly ports?: readonly PortDefinition[];
  readonly aliases?: readonly string[];
  readonly properties?: readonly PropertyMetadata[];
  readonly states?: readonly SymbolState[];
  readonly capabilities?: readonly SymbolRuntimeCapability[];
}

function industrialSymbol(options: IndustrialSymbolOptions): SymbolDefinition {
  const name = options.type.slice(options.type.indexOf(".") + 1);
  const states = options.states ?? ALL_OPERATIONAL_STATES;
  const profiles: BuiltInSymbolAnimationProfile[] = [];
  if (/(motor|pump|fan|mixer|encoder)/.test(name)) profiles.push("motion");
  if (/(pipe|conveyor)/.test(name)) profiles.push("flow");
  if (/(tank|vessel)/.test(name)) profiles.push("level");
  if (/(lamp|beacon|indicator)/.test(name)) profiles.push("indicator");
  if (name.includes('valve')) profiles.push("valve");
  return {
    type: options.type,
    version: 1,
    displayNameKey: `symbols.${options.type}`,
    descriptionKey: `symbols.${options.type}.description`,
    category: options.category,
    defaultWidth: options.width,
    defaultHeight: options.height,
    minimumWidth: Math.max(24, Math.round(options.width * 0.3)),
    minimumHeight: Math.max(24, Math.round(options.height * 0.3)),
    ports: options.ports ?? PROCESS_PORTS,
    editableProperties: [...COMMON_PROPERTIES, ...(options.properties ?? [])],
    bindableProperties: [
      { key: "fill", dataTypes: ["string"] },
      { key: "state", dataTypes: ["string"] }
    ],
    supportedStates: states,
    runtimeCapabilities: options.capabilities ?? ALL_RUNTIME_CAPABILITIES,
    ...(profiles.length === 0 ? {} : { animation: createBuiltInSymbolAnimationMetadata(profiles) }),
    capabilities: [
      "resizable",
      "rotatable",
      "connectable",
      "runtime-bindable",
      "supports-state",
      "alarm-visual-compatible"
    ],
    tags: [options.category, "industrial"],
    aliases: options.aliases ?? [`industrial.${name}`]
  };
}

export const INDUSTRIAL_SYMBOL_TYPES = {
  centrifugalPump: "process.centrifugal-pump",
  gateValve: "process.gate-valve",
  globeValve: "process.globe-valve",
  butterflyValve: "process.butterfly-valve",
  checkValve: "process.check-valve",
  horizontalTank: "process.horizontal-tank",
  verticalTank: "process.vertical-tank",
  pipe: "process.pipe",
  mixer: "process.mixer",
  heatExchanger: "process.heat-exchanger",
  pressureSensor: "instrumentation.pressure-sensor",
  temperatureSensor: "instrumentation.temperature-sensor",
  flowSensor: "instrumentation.flow-sensor",
  levelSensor: "instrumentation.level-sensor",
  indicator: "instrumentation.indicator",
  transmitter: "instrumentation.transmitter",
  controller: "instrumentation.controller",
  acMotor: "electrical.ac-motor",
  transformer: "electrical.transformer",
  circuitBreaker: "electrical.circuit-breaker",
  switch: "electrical.switch",
  generator: "electrical.generator",
  powerSource: "electrical.power-source",
  supplyFan: "bms.supply-fan",
  exhaustFan: "bms.exhaust-fan",
  damper: "bms.damper",
  ahu: "bms.ahu",
  coolingCoil: "bms.cooling-coil",
  heatingCoil: "bms.heating-coil",
  emergencyStop: "safety.emergency-stop",
  alarmBeacon: "safety.alarm-beacon",
  siren: "safety.siren",
  plc: "network-control.plc",
  hmi: "network-control.hmi",
  gateway: "network-control.gateway",
  server: "network-control.server",
  networkSwitch: "network-control.network-switch",
  lamp: "control.indicator.lamp",
  encoder: "instrumentation.encoder.rotary",
  limitSwitch: "control.limit-switch",
  relay: "electrical.relay",
  vfd: "automation.vfd"
} as const;

const sensorProperties: readonly PropertyMetadata[] = [
  {
    key: "code",
    labelKey: "properties.instrumentCode",
    kind: "text",
    defaultValue: "S",
    group: "instrument",
    order: 50
  },
  {
    key: "unit",
    labelKey: "properties.unit",
    kind: "unit",
    defaultValue: "",
    group: "instrument",
    order: 60
  }
];

const SENSOR_CODES = [
  ["pressureSensor", "P"],
  ["temperatureSensor", "T"],
  ["flowSensor", "F"],
  ["levelSensor", "L"]
] as const;

export const INDUSTRIAL_SYMBOLS: readonly SymbolDefinition[] = [
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.centrifugalPump,
    category: "process",
    width: 120,
    height: 90,
    aliases: ["pump.centrifugal", "industrial.centrifugal-pump"]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.gateValve,
    category: "process",
    width: 90,
    height: 70
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.globeValve,
    category: "process",
    width: 90,
    height: 78
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.butterflyValve,
    category: "process",
    width: 86,
    height: 72
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.checkValve,
    category: "process",
    width: 90,
    height: 68
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.horizontalTank,
    category: "process",
    width: 180,
    height: 100,
    properties: [
      {
        key: "level",
        labelKey: "properties.level",
        kind: "number",
        defaultValue: 0.6,
        minimum: 0,
        maximum: 1,
        step: 0.01,
        bindable: true
      }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.verticalTank,
    category: "process",
    width: 110,
    height: 180,
    properties: [
      {
        key: "level",
        labelKey: "properties.level",
        kind: "number",
        defaultValue: 0.6,
        minimum: 0,
        maximum: 1,
        step: 0.01,
        bindable: true
      }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.pipe,
    category: "process",
    width: 180,
    height: 32,
    aliases: ["process.pipeline"],
    properties: [
      {
        key: "flowDirection",
        labelKey: "properties.flowDirection",
        kind: "select",
        defaultValue: "forward",
        options: [
          { value: "forward", labelKey: "directions.forward" },
          { value: "reverse", labelKey: "directions.reverse" }
        ]
      }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.mixer,
    category: "process",
    width: 120,
    height: 150,
    ports: [...PROCESS_PORTS, port("power", "Power", 0.5, 0, "input", "electricity")]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.heatExchanger,
    category: "process",
    width: 160,
    height: 110,
    ports: [
      port("hot-in", "Hot in", 0, 0.25, "input", "generic"),
      port("hot-out", "Hot out", 1, 0.25, "output", "generic"),
      port("cold-in", "Cold in", 1, 0.75, "input", "generic"),
      port("cold-out", "Cold out", 0, 0.75, "output", "generic")
    ]
  }),
  ...SENSOR_CODES.map(([key, code]) =>
    industrialSymbol({
      type: INDUSTRIAL_SYMBOL_TYPES[key],
      category: "instrumentation",
      width: 72,
      height: 72,
      ports: SIGNAL_PORTS,
      properties: sensorProperties.map((property) =>
        property.key === "code" ? { ...property, defaultValue: code } : property
      )
    })
  ),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.indicator,
    category: "instrumentation",
    width: 72,
    height: 72,
    ports: [port("signal", "Signal", 0, 0.5, "input", "signal")],
    properties: sensorProperties
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.transmitter,
    category: "instrumentation",
    width: 86,
    height: 86,
    ports: SIGNAL_PORTS,
    properties: sensorProperties
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.controller,
    category: "instrumentation",
    width: 100,
    height: 82,
    ports: [
      port("measurement", "Measurement", 0, 0.5, "input", "signal"),
      port("control", "Control", 1, 0.5, "output", "signal")
    ],
    properties: sensorProperties
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.acMotor,
    category: "electrical",
    width: 110,
    height: 90,
    ports: [
      port("power", "Power", 0, 0.5, "input", "electricity"),
      port("shaft", "Shaft", 1, 0.5, "output", "generic")
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.transformer,
    category: "electrical",
    width: 120,
    height: 100,
    ports: ELECTRICAL_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.circuitBreaker,
    category: "electrical",
    width: 100,
    height: 70,
    ports: ELECTRICAL_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.switch,
    category: "electrical",
    width: 100,
    height: 64,
    ports: ELECTRICAL_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.generator,
    category: "electrical",
    width: 110,
    height: 100,
    ports: [port("power", "Power", 1, 0.5, "output", "electricity")]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.powerSource,
    category: "electrical",
    width: 90,
    height: 100,
    ports: [port("power", "Power", 1, 0.5, "output", "electricity")]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.supplyFan,
    category: "bms",
    width: 110,
    height: 90,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.exhaustFan,
    category: "bms",
    width: 110,
    height: 90,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.damper,
    category: "bms",
    width: 100,
    height: 70,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.ahu,
    category: "bms",
    width: 190,
    height: 110,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.coolingCoil,
    category: "bms",
    width: 110,
    height: 90,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.heatingCoil,
    category: "bms",
    width: 110,
    height: 90,
    ports: PROCESS_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.emergencyStop,
    category: "safety",
    width: 84,
    height: 84,
    ports: [port("signal", "Signal", 1, 0.5, "output", "signal")],
    states: ["normal", "active", "inactive", "alarm", "offline", "disabled"],
    capabilities: ["active", "inactive", "alarm", "offline", "disabled"]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.alarmBeacon,
    category: "safety",
    width: 78,
    height: 92,
    ports: [port("signal", "Signal", 0.5, 1, "input", "signal")],
    states: ["normal", "active", "inactive", "warning", "alarm", "offline", "disabled"],
    capabilities: ["active", "inactive", "warning", "alarm", "offline", "disabled"]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.siren,
    category: "safety",
    width: 100,
    height: 76,
    ports: [port("signal", "Signal", 0, 0.5, "input", "signal")],
    states: ["normal", "active", "inactive", "alarm", "offline", "disabled"],
    capabilities: ["active", "inactive", "alarm", "offline", "disabled"]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.plc,
    category: "network-control",
    width: 140,
    height: 110,
    ports: NETWORK_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.hmi,
    category: "network-control",
    width: 150,
    height: 105,
    ports: NETWORK_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.gateway,
    category: "network-control",
    width: 120,
    height: 90,
    ports: NETWORK_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.server,
    category: "network-control",
    width: 110,
    height: 130,
    ports: NETWORK_PORTS
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.networkSwitch,
    category: "network-control",
    width: 150,
    height: 72,
    ports: [...NETWORK_PORTS, port("uplink", "Uplink", 0.5, 0, "bidirectional", "network")]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.lamp,
    category: "indicators-alarms",
    width: 64,
    height: 64,
    ports: [port("signal", "Signal", 0, 0.5, "input", "signal")],
    aliases: ["lamp", "industrial.lamp"],
    states: ["normal", "active", "inactive", "warning", "offline", "disabled"],
    capabilities: ["active", "inactive", "warning", "offline", "disabled", "value"],
    properties: [
      { key: "offColor", labelKey: "properties.offColor", kind: "color", defaultValue: "#64748b" },
      { key: "onColor", labelKey: "properties.onColor", kind: "color", defaultValue: "#22c55e" },
      { key: "showLabel", labelKey: "properties.showLabel", kind: "boolean", defaultValue: true }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.encoder,
    category: "instrumentation",
    width: 88,
    height: 88,
    ports: SIGNAL_PORTS,
    aliases: ["encoder", "industrial.encoder"],
    capabilities: [...ALL_RUNTIME_CAPABILITIES, "value", "text", "direction"],
    properties: [
      {
        key: "resolution",
        labelKey: "properties.resolution",
        kind: "number",
        defaultValue: 1024,
        minimum: 1
      },
      { key: "unit", labelKey: "properties.unit", kind: "unit", defaultValue: "pulse" },
      { key: "showValue", labelKey: "properties.showValue", kind: "boolean", defaultValue: true }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.limitSwitch,
    category: "safety",
    width: 92,
    height: 58,
    ports: ELECTRICAL_PORTS,
    aliases: ["limit-switch"],
    states: ["normal", "active", "inactive", "offline", "disabled"],
    capabilities: ["active", "inactive", "offline", "disabled"],
    properties: [
      {
        key: "normallyOpen",
        labelKey: "properties.normallyOpen",
        kind: "boolean",
        defaultValue: true
      },
      {
        key: "actuatorColor",
        labelKey: "properties.actuatorColor",
        kind: "color",
        defaultValue: "#e2e8f0"
      }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.relay,
    category: "electrical",
    width: 112,
    height: 78,
    ports: ELECTRICAL_PORTS,
    aliases: ["relay"],
    states: ["normal", "active", "inactive", "offline", "disabled"],
    capabilities: ["active", "inactive", "offline", "disabled"],
    properties: [
      {
        key: "coilVoltage",
        labelKey: "properties.coilVoltage",
        kind: "number",
        defaultValue: 24,
        minimum: 0
      },
      {
        key: "contactType",
        labelKey: "properties.contactType",
        kind: "select",
        defaultValue: "normally-open",
        options: [
          { value: "normally-open", labelKey: "contactTypes.normallyOpen" },
          { value: "normally-closed", labelKey: "contactTypes.normallyClosed" }
        ]
      }
    ]
  }),
  industrialSymbol({
    type: INDUSTRIAL_SYMBOL_TYPES.vfd,
    category: "network-control",
    width: 126,
    height: 104,
    ports: [...ELECTRICAL_PORTS, port("control", "Control", 0.5, 1, "input", "signal")],
    aliases: ["vfd", "industrial.vfd"],
    capabilities: [...ALL_RUNTIME_CAPABILITIES, "value", "text", "speed"],
    properties: [
      {
        key: "ratedPower",
        labelKey: "properties.ratedPower",
        kind: "number",
        defaultValue: 7.5,
        minimum: 0
      },
      {
        key: "ratedVoltage",
        labelKey: "properties.ratedVoltage",
        kind: "number",
        defaultValue: 400,
        minimum: 0
      },
      {
        key: "showFrequency",
        labelKey: "properties.showFrequency",
        kind: "boolean",
        defaultValue: true
      }
    ]
  })
];

function pack(
  id: string,
  displayName: string,
  categories: readonly SymbolCategory[]
): Readonly<SymbolPack> {
  return defineSymbolPack({
    id,
    version: "1.0.0",
    displayName,
    definitions: INDUSTRIAL_SYMBOLS.filter(({ category }) => categories.includes(category))
  });
}

export const standardProcessPack = pack("standard-process", "Standard Process", ["process"]);
export const standardInstrumentationPack = pack(
  "standard-instrumentation",
  "Standard Instrumentation",
  ["instrumentation", "indicator"]
);
export const standardElectricalPack = pack("standard-electrical", "Standard Electrical", [
  "electrical"
]);
export const standardControlPack = pack("standard-control", "Standard Control", [
  "network-control",
  "safety"
]);
export const standardIndustrialPack = defineSymbolPack({
  id: "standard-industrial",
  version: "1.0.0",
  displayName: "Standard Industrial Symbols",
  definitions: INDUSTRIAL_SYMBOLS
});
