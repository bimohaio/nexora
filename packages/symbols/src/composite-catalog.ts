import type { JsonValue, Medium, PortDefinition } from "@web-scada/core";
import type {
  PropertyMetadata,
  SymbolCapability,
  SymbolDefinition,
  SymbolRuntimeCapability,
  SymbolState,
  SymbolVariantDefinition
} from "./symbol.js";
import {
  createBuiltInSymbolAnimationMetadata,
  type BuiltInSymbolAnimationProfile
} from "./animation-metadata.js";

export interface CompositeCatalogEntry {
  readonly name: string;
  readonly type: string;
  readonly category: string;
  readonly family: string;
  readonly visualKind: string;
}

interface CatalogGroup {
  readonly category: string;
  readonly prefix: string;
  readonly family: string;
  readonly names: readonly string[];
}

const GROUPS: readonly CatalogGroup[] = [
  {
    category: "indicators-alarms",
    prefix: "indicator",
    family: "indicator",
    names: [
      "Lamp",
      "Pilot Lamp",
      "LED",
      "Round Indicator",
      "Square Indicator",
      "Beacon",
      "Dual Beacon",
      "Triple Beacon",
      "Stack Light 2 Segment",
      "Stack Light 3 Segment",
      "Stack Light 4 Segment",
      "Stack Light 5 Segment",
      "Alarm Horn",
      "Alarm Siren",
      "Status Badge"
    ]
  },
  {
    category: "hmi-controls",
    prefix: "control",
    family: "control",
    names: [
      "Push Button",
      "Start Button",
      "Stop Button",
      "Emergency Stop",
      "Reset Button",
      "Auto Button",
      "Manual Button",
      "Mode Switch",
      "Toggle Switch",
      "Selector Switch 2 Position",
      "Selector Switch 3 Position",
      "Rotary Switch",
      "Momentary Button",
      "Acknowledgement Button",
      "Navigation Button",
      "Command Button",
      "Soft Button",
      "Icon Button",
      "Lock Button",
      "Key Switch"
    ]
  },
  {
    category: "valves",
    prefix: "valve",
    family: "valve",
    names: [
      "Gate Valve",
      "Globe Valve",
      "Ball Valve",
      "Butterfly Valve",
      "Check Valve",
      "Knife Gate Valve",
      "Plug Valve",
      "Needle Valve",
      "Pinch Valve",
      "Diaphragm Valve",
      "Pressure Relief Valve",
      "Safety Valve",
      "Control Valve",
      "Motorized Valve",
      "Pneumatic Valve",
      "Hydraulic Valve",
      "Solenoid Valve",
      "Three-Way Valve",
      "Four-Way Valve",
      "Mixing Valve",
      "Diverter Valve",
      "Angle Valve",
      "Foot Valve",
      "Float Valve",
      "Vacuum Valve",
      "Steam Valve",
      "Drain Valve",
      "Sampling Valve",
      "Flow Control Valve",
      "Pressure Regulator",
      "Shutoff Valve",
      "Isolation Valve",
      "Relief Valve",
      "Bypass Valve",
      "Custom Valve"
    ]
  },
  {
    category: "pumps",
    prefix: "pump",
    family: "pump",
    names: [
      "Centrifugal Pump",
      "Gear Pump",
      "Screw Pump",
      "Diaphragm Pump",
      "Vacuum Pump",
      "Hydraulic Pump",
      "Submersible Pump",
      "Dosing Pump",
      "Peristaltic Pump",
      "Vertical Pump",
      "Horizontal Pump",
      "Booster Pump",
      "Twin Pump",
      "Chemical Pump",
      "Slurry Pump",
      "Fire Pump",
      "Cooling Pump",
      "Custom Pump"
    ]
  },
  {
    category: "motors-drives",
    prefix: "motor",
    family: "motor",
    names: [
      "AC Motor",
      "DC Motor",
      "Servo Motor",
      "Stepper Motor",
      "Induction Motor",
      "Synchronous Motor",
      "Explosion-Proof Motor",
      "Brake Motor",
      "VFD Motor",
      "Gear Motor",
      "Linear Motor",
      "Compressor Motor",
      "Fan Motor",
      "Pump Motor",
      "Mixer Motor",
      "Conveyor Motor",
      "Motor Drive",
      "Motor Starter"
    ]
  },
  {
    category: "pipes-connectors",
    prefix: "pipe",
    family: "pipe",
    names: [
      "Straight Pipe",
      "Vertical Pipe",
      "90-Degree Elbow",
      "45-Degree Elbow",
      "Tee",
      "Cross",
      "Reducer",
      "Expander",
      "Flexible Pipe",
      "Double Pipe",
      "Jacketed Pipe",
      "Pipe Cap",
      "Pipe End",
      "Flange",
      "Coupling",
      "Union",
      "Joint",
      "Branch",
      "Flow Arrow",
      "Direction Indicator",
      "Drain Connection",
      "Vent Connection",
      "Pipe Bend",
      "Pipe Segment",
      "Custom Pipe"
    ]
  },
  {
    category: "tanks-vessels",
    prefix: "vessel",
    family: "vessel",
    names: [
      "Vertical Tank",
      "Horizontal Tank",
      "Cone Tank",
      "Flat-Bottom Tank",
      "Open Tank",
      "Closed Tank",
      "Mixing Tank",
      "Reactor",
      "Pressure Vessel",
      "Separator Vessel",
      "Storage Tank",
      "Silo",
      "Hopper",
      "Water Tower",
      "Heated Tank",
      "Cooling Tank",
      "Chemical Tank",
      "Fuel Tank",
      "Gas Tank",
      "Fermenter",
      "Custom Vessel",
      "Tank Farm"
    ]
  },
  {
    category: "conveyors-material-handling",
    prefix: "conveyor",
    family: "conveyor",
    names: [
      "Belt Conveyor",
      "Roller Conveyor",
      "Chain Conveyor",
      "Screw Conveyor",
      "Bucket Elevator",
      "Vertical Conveyor",
      "Horizontal Conveyor",
      "Inclined Conveyor",
      "Feeder",
      "Rotary Feeder",
      "Vibrating Conveyor",
      "Drag Conveyor",
      "Pallet Conveyor",
      "Transfer Conveyor",
      "Custom Conveyor"
    ]
  },
  {
    category: "process-equipment",
    prefix: "process-equipment",
    family: "process-equipment",
    names: [
      "Heat Exchanger",
      "Boiler",
      "Furnace",
      "Dryer",
      "Cooler",
      "Evaporator",
      "Condenser",
      "Cyclone",
      "Scrubber",
      "Filter",
      "Bag Filter",
      "Dust Collector",
      "Crusher",
      "Mill",
      "Mixer",
      "Blender",
      "Agitator",
      "Separator",
      "Centrifuge",
      "Compressor",
      "Air Receiver",
      "Gas Receiver",
      "Vacuum System",
      "Burner",
      "Incinerator",
      "Chiller",
      "Cooling Tower",
      "Water Treatment Unit",
      "Reverse Osmosis Unit",
      "Clarifier",
      "Thickener",
      "Reactor Vessel",
      "Gas Generator",
      "Steam Generator",
      "Custom Equipment"
    ]
  },
  {
    category: "instruments-sensors",
    prefix: "instrument",
    family: "instrument",
    names: [
      "Pressure Indicator",
      "Pressure Transmitter",
      "Pressure Gauge",
      "Differential Pressure Instrument",
      "Temperature Indicator",
      "Temperature Transmitter",
      "Thermocouple",
      "RTD",
      "Flow Indicator",
      "Flow Meter",
      "Flow Transmitter",
      "Mass Flow Meter",
      "Level Indicator",
      "Level Transmitter",
      "Radar Level Sensor",
      "Ultrasonic Level Sensor",
      "Float Level Sensor",
      "Conductivity Meter",
      "pH Meter",
      "ORP Meter",
      "Turbidity Meter",
      "Oxygen Analyzer",
      "Gas Detector",
      "Humidity Sensor",
      "Vibration Sensor",
      "Current Meter",
      "Voltage Meter",
      "Power Meter",
      "Energy Meter",
      "Frequency Meter",
      "Speed Sensor",
      "Position Sensor",
      "Encoder",
      "Counter",
      "Timer",
      "Load Cell",
      "Weigh Scale",
      "Analyzer",
      "Barcode Reader",
      "RFID Reader"
    ]
  },
  {
    category: "electrical",
    prefix: "electrical-library",
    family: "electrical",
    names: [
      "Transformer",
      "Generator",
      "UPS",
      "Battery",
      "Solar Panel",
      "Inverter",
      "Rectifier",
      "Busbar",
      "Fuse",
      "Circuit Breaker",
      "Contactor",
      "Relay",
      "Motor Control Center",
      "Switchgear",
      "Capacitor Bank",
      "Soft Starter",
      "VFD Cabinet",
      "PLC",
      "Remote I/O",
      "Control Panel",
      "Power Supply",
      "Distribution Board",
      "Terminal Block",
      "Ground",
      "Disconnect Switch",
      "Automatic Transfer Switch",
      "Current Transformer",
      "Potential Transformer",
      "Protection Relay",
      "Custom Cabinet"
    ]
  },
  {
    category: "hvac",
    prefix: "hvac",
    family: "hvac",
    names: [
      "Fan",
      "Axial Fan",
      "Centrifugal Fan",
      "Blower",
      "Damper",
      "Air Handling Unit",
      "Fan Coil Unit",
      "Cooling Coil",
      "Heating Coil",
      "Exhaust Fan",
      "Air Filter",
      "HVAC Compressor",
      "HVAC Chiller",
      "HVAC Cooling Tower",
      "Ventilation Unit"
    ]
  },
  {
    category: "displays-visualization",
    prefix: "display",
    family: "display",
    names: [
      "Digital Display",
      "Numeric Display",
      "Gauge",
      "Radial Gauge",
      "Linear Gauge",
      "Thermometer",
      "Tank Level Display",
      "Bar Graph",
      "Progress Bar",
      "Trend",
      "Mini Trend",
      "Historical Trend",
      "Chart",
      "XY Plot",
      "Pie Chart",
      "Alarm List",
      "Event List",
      "Recipe Display",
      "Status Table",
      "Dashboard Widget"
    ]
  },
  {
    category: "navigation-layout",
    prefix: "layout",
    family: "layout",
    names: [
      "Group",
      "Panel",
      "Frame",
      "Popup",
      "Window",
      "Tab",
      "Menu",
      "Toolbar",
      "Navigation Bar",
      "Page Link",
      "Overview",
      "Overview Map",
      "Zoom Control",
      "Compass",
      "Legend",
      "North Arrow",
      "Mini Map",
      "Annotation",
      "Callout",
      "Container"
    ]
  },
  {
    category: "utilities-authoring",
    prefix: "authoring",
    family: "authoring",
    names: [
      "Text Label",
      "Title",
      "Value Label",
      "Unit Label",
      "Arrow",
      "Direction Arrow",
      "Dimension Line",
      "Connection Point",
      "Anchor",
      "Handle",
      "Selection Box",
      "Resize Handle",
      "Rotation Handle",
      "Bounding Box",
      "Grid Marker",
      "Crosshair",
      "Image",
      "SVG Symbol",
      "Custom Shape",
      "Placeholder"
    ]
  },
  {
    category: "robotics-automation",
    prefix: "automation",
    family: "automation",
    names: [
      "Robot Arm",
      "Automated Guided Vehicle",
      "Autonomous Mobile Robot",
      "Forklift",
      "Crane",
      "Hoist",
      "Elevator",
      "Packaging Machine",
      "Labeling Machine",
      "Palletizer",
      "Depalletizer",
      "Vision Camera",
      "Industrial Camera",
      "Machine Cell",
      "Production Line"
    ]
  },
  {
    category: "oil-gas",
    prefix: "oil-gas",
    family: "oil-gas",
    names: [
      "Wellhead",
      "Pipeline Pig",
      "Compressor Station",
      "Flare",
      "Oil and Gas Separator",
      "Gas Turbine",
      "Steam Turbine",
      "Oil Pump",
      "Gas Pump",
      "Storage Sphere",
      "Pipeline Valve Station",
      "Metering Station",
      "LNG Tank",
      "Refinery Column",
      "Pipeline Junction"
    ]
  }
];

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .toLocaleLowerCase();
}

export const COMPOSITE_CATALOG: readonly CompositeCatalogEntry[] = Object.freeze(
  GROUPS.flatMap((group) =>
    group.names.map((name) =>
      Object.freeze({
        name,
        type: `${group.prefix}.${slug(name)}`,
        category: group.category,
        family: group.family,
        visualKind: slug(name)
      })
    )
  )
);

const COMMON_STATES: readonly SymbolState[] = Object.freeze([
  "normal",
  "inactive",
  "active",
  "warning",
  "alarm",
  "fault",
  "maintenance",
  "disabled",
  "unavailable",
  "unknown",
  "communication-lost"
]);
const MOTION_STATES: readonly SymbolState[] = Object.freeze([
  ...COMMON_STATES,
  "stopped",
  "starting",
  "running",
  "stopping"
]);
const VALVE_STATES: readonly SymbolState[] = Object.freeze([
  ...COMMON_STATES,
  "open",
  "opening",
  "closed",
  "closing"
]);
const COMMON_CAPABILITIES: readonly SymbolCapability[] = Object.freeze([
  "resizable",
  "rotatable",
  "flippable-horizontal",
  "flippable-vertical",
  "theme-aware",
  "runtime-bindable",
  "supports-state",
  "alarm-visual-compatible",
  "palette-item"
]);
const ORIENTATION_VARIANTS: readonly SymbolVariantDefinition[] = Object.freeze([
  {
    id: "horizontal",
    displayNameKey: "variants.horizontal",
    properties: { orientation: "horizontal" }
  },
  { id: "vertical", displayNameKey: "variants.vertical", properties: { orientation: "vertical" } }
]);
const COMMON_PROPERTIES: readonly PropertyMetadata[] = Object.freeze([
  {
    key: "fill",
    labelKey: "properties.fill",
    kind: "color",
    defaultValue: "#475569",
    bindable: true,
    animatable: true,
    group: "appearance",
    order: 10
  },
  {
    key: "stroke",
    labelKey: "properties.stroke",
    kind: "color",
    defaultValue: "#0f172a",
    bindable: true,
    animatable: true,
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
  },
  {
    key: "variant",
    labelKey: "properties.variant",
    kind: "select",
    defaultValue: "horizontal",
    options: ORIENTATION_VARIANTS.map(({ id, displayNameKey }) => ({
      value: id,
      labelKey: displayNameKey
    })),
    group: "geometry",
    order: 50
  }
]);

function runtimeProperty(
  key: string,
  kind: PropertyMetadata["kind"],
  defaultValue: JsonValue,
  options: Pick<PropertyMetadata, "minimum" | "maximum" | "unit" | "animatable"> = {}
): PropertyMetadata {
  return {
    key,
    labelKey: `properties.${key}`,
    kind,
    defaultValue,
    bindable: true,
    group: "runtime",
    order: 60,
    ...options
  };
}

function familyProperties(family: string): readonly PropertyMetadata[] {
  if (["indicator", "control"].includes(family))
    return [runtimeProperty("enabled", "boolean", true)];
  if (family === "valve")
    return [
      runtimeProperty("openPercentage", "number", 0, {
        minimum: 0,
        maximum: 100,
        unit: "%",
        animatable: true
      })
    ];
  if (["pump", "motor", "conveyor", "hvac"].includes(family))
    return [
      runtimeProperty("speed", "number", 0, {
        minimum: 0,
        maximum: 100,
        unit: "%",
        animatable: true
      })
    ];
  if (family === "pipe") return [runtimeProperty("flow", "number", 0, { animatable: true })];
  if (family === "vessel")
    return [
      runtimeProperty("level", "number", 0, {
        minimum: 0,
        maximum: 100,
        unit: "%",
        animatable: true
      })
    ];
  if (family === "instrument")
    return [
      runtimeProperty("value", "number", 0),
      { ...runtimeProperty("unit", "unit", ""), order: 70 }
    ];
  if (family === "display")
    return [
      runtimeProperty("value", "number", 0),
      { ...runtimeProperty("text", "text", ""), order: 70 }
    ];
  return [];
}

function familyRuntimeCapabilities(family: string): readonly SymbolRuntimeCapability[] {
  if (family === "valve") return ["open"];
  if (["pump", "motor", "conveyor", "hvac"].includes(family)) return ["speed", "animation"];
  if (family === "pipe") return ["flow", "direction", "animation"];
  if (family === "vessel") return ["level", "animation"];
  if (family === "instrument") return ["value"];
  if (family === "display") return ["value", "text"];
  if (["indicator", "control"].includes(family)) return ["enabled"];
  return [];
}

function port(
  id: string,
  x: number,
  y: number,
  direction: PortDefinition["direction"],
  medium: Medium
): PortDefinition {
  return {
    id,
    label: id,
    position: { x, y },
    direction,
    medium,
    acceptedMediums: [],
    acceptedDirections:
      direction === "input"
        ? ["output", "bidirectional"]
        : direction === "output"
          ? ["input", "bidirectional"]
          : ["input", "output", "bidirectional"]
  };
}

function familyPorts(family: string): readonly PortDefinition[] {
  if (["indicator", "control", "instrument", "display"].includes(family))
    return [port("signal-in", 0, 0.5, "input", "signal")];
  if (family === "electrical")
    return [
      port("power-in", 0, 0.5, "input", "electricity"),
      port("power-out", 1, 0.5, "output", "electricity")
    ];
  if (["layout", "authoring"].includes(family)) return [];
  if (family === "motor")
    return [
      port("power-in", 0, 0.5, "input", "electricity"),
      port("shaft", 1, 0.5, "output", "generic")
    ];
  if (family === "valve")
    return [port("inlet", 0, 0.5, "input", "generic"), port("outlet", 1, 0.5, "output", "generic")];
  if (family === "pump")
    return [
      port("suction", 0, 0.5, "input", "generic"),
      port("discharge", 1, 0.5, "output", "generic")
    ];
  return [port("inlet", 0, 0.5, "input", "generic"), port("outlet", 1, 0.5, "output", "generic")];
}

function dimensions(family: string): readonly [number, number] {
  if (["pipe", "conveyor"].includes(family)) return [140, 54];
  if (["vessel", "automation", "oil-gas"].includes(family)) return [110, 130];
  if (["display", "layout"].includes(family)) return [160, 100];
  if (family === "instrument") return [84, 84];
  return [110, 84];
}

function definition(entry: CompositeCatalogEntry): SymbolDefinition {
  const [width, height] = dimensions(entry.family);
  const states =
    entry.family === "valve"
      ? VALVE_STATES
      : ["pump", "motor", "conveyor", "automation", "hvac"].includes(entry.family)
        ? MOTION_STATES
        : COMMON_STATES;
  const stateCapabilities: readonly SymbolRuntimeCapability[] = states.filter(
    (state): state is Exclude<SymbolState, "normal"> => state !== "normal"
  );
  const runtimeCapabilities = [...stateCapabilities, ...familyRuntimeCapabilities(entry.family)];
  const ports = familyPorts(entry.family);
  const specializedProperties = familyProperties(entry.family);
  const animationProfiles: BuiltInSymbolAnimationProfile[] = [];
  if (["pump", "motor", "hvac", "automation"].includes(entry.family))
    animationProfiles.push("motion");
  if (["pipe", "conveyor"].includes(entry.family)) animationProfiles.push("flow");
  if (entry.family === "vessel") animationProfiles.push("level");
  if (entry.family === "indicator") animationProfiles.push("indicator");
  if (entry.family === "valve") animationProfiles.push("valve");
  return {
    type: entry.type,
    version: 1,
    displayNameKey: `symbols.${entry.type}`,
    descriptionKey: `symbols.${entry.type}.description`,
    category: entry.category,
    defaultWidth: width,
    defaultHeight: height,
    minimumWidth: Math.max(24, Math.round(width * 0.3)),
    minimumHeight: Math.max(24, Math.round(height * 0.3)),
    aspectRatio: "free",
    variants: ORIENTATION_VARIANTS,
    ports,
    anchors: ports.map(({ id, position }) => ({ id, position, visible: "connected" })),
    editableProperties: [...COMMON_PROPERTIES, ...specializedProperties],
    bindableProperties: [
      { key: "fill", dataTypes: ["string"] },
      { key: "state", dataTypes: ["string"] },
      ...specializedProperties.map(({ key, kind }) => ({
        key,
        dataTypes:
          kind === "number"
            ? (["number"] as const)
            : kind === "boolean"
              ? (["boolean"] as const)
              : (["string"] as const)
      }))
    ],
    supportedStates: states,
    runtimeCapabilities,
    ...(animationProfiles.length === 0
      ? {}
      : { animation: createBuiltInSymbolAnimationMetadata(animationProfiles) }),
    capabilities: [
      ...COMMON_CAPABILITIES,
      ...(ports.length > 0 ? (["connectable"] as const) : []),
      ...(entry.family === "vessel" ? (["supports-level"] as const) : []),
      ...(entry.family === "valve" ? (["supports-open-percentage"] as const) : []),
      ...(["instrument", "display"].includes(entry.family) ? (["supports-value"] as const) : []),
      ...(["pump", "motor", "conveyor", "hvac", "pipe", "vessel"].includes(entry.family)
        ? (["animation-compatible"] as const)
        : []),
      ...(entry.family === "control" ? (["interactive"] as const) : [])
    ],
    tags: [entry.category, entry.family, entry.visualKind, "industrial"],
    metadata: {
      catalogName: entry.name,
      visualFamily: entry.family,
      visualKind: entry.visualKind
    }
  };
}

export const COMPOSITE_SYMBOLS: readonly SymbolDefinition[] = Object.freeze(
  COMPOSITE_CATALOG.map(definition)
);
