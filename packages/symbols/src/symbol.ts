import type { ExtensionData, JsonValue, PortDefinition } from "@web-scada/core";
import { isNormalizedPoint } from "@web-scada/geometry";

export type SymbolState =
  "normal" | "running" | "stopped" | "warning" | "alarm" | "offline" | "disabled";

export type BuiltInSymbolCategory =
  | "basic"
  | "equipment"
  | "valve"
  | "pump"
  | "motor"
  | "tank"
  | "sensor"
  | "indicator"
  | "text"
  | "pipe"
  | "electrical"
  | "custom";
export type SymbolCategory = BuiltInSymbolCategory | (string & {});

export type PropertyEditorType =
  "text" | "number" | "boolean" | "color" | "select" | "unit" | "binding" | "readonly";

export interface PropertyOption {
  readonly value: JsonValue;
  readonly labelKey: string;
}

export interface PropertyMetadata {
  readonly key: string;
  readonly labelKey: string;
  readonly kind: PropertyEditorType;
  readonly defaultValue?: JsonValue;
  readonly required?: boolean;
  readonly readonly?: boolean;
  readonly bindable?: boolean;
  readonly group?: string;
  readonly order?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly options?: readonly PropertyOption[];
  readonly unit?: string;
  readonly validation?: Readonly<Record<string, JsonValue>>;
}

export interface BindablePropertyMetadata {
  readonly key: string;
  readonly dataTypes: readonly ("boolean" | "number" | "string")[];
}

export interface SymbolDefinition {
  readonly type: string;
  readonly displayNameKey: string;
  readonly category: SymbolCategory;
  readonly descriptionKey?: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly minimumWidth: number;
  readonly minimumHeight: number;
  readonly ports: readonly PortDefinition[];
  readonly editableProperties: readonly PropertyMetadata[];
  readonly bindableProperties: readonly BindablePropertyMetadata[];
  readonly supportedStates: readonly SymbolState[];
  readonly metadata?: ExtensionData;
}

export interface RegisterOptions {
  readonly replace?: boolean;
}

export interface SymbolRegistry {
  register(definition: SymbolDefinition, options?: RegisterOptions): void;
  registerMany(definitions: readonly SymbolDefinition[], options?: RegisterOptions): void;
  unregister(type: string): boolean;
  get(type: string): SymbolDefinition | undefined;
  has(type: string): boolean;
  getAll(): readonly SymbolDefinition[];
  getByCategory(category: string): readonly SymbolDefinition[];
  clear(): void;
}

function validateDefinition(definition: SymbolDefinition): void {
  if (definition.type.trim() === "") throw new Error("Symbol type is required.");
  if (
    !Number.isFinite(definition.defaultWidth) ||
    !Number.isFinite(definition.defaultHeight) ||
    !Number.isFinite(definition.minimumWidth) ||
    !Number.isFinite(definition.minimumHeight) ||
    definition.defaultWidth <= 0 ||
    definition.defaultHeight <= 0 ||
    definition.minimumWidth <= 0 ||
    definition.minimumHeight <= 0
  )
    throw new Error(`Symbol dimensions must be positive: ${definition.type}`);
  const portIds = new Set<string>();
  for (const port of definition.ports) {
    if (portIds.has(port.id)) throw new Error(`Duplicate port ID: ${port.id}`);
    portIds.add(port.id);
    if (!isNormalizedPoint(port.position)) throw new Error(`Invalid port position: ${port.id}`);
    if (port.maxConnections !== undefined && port.maxConnections <= 0)
      throw new Error(`Port maxConnections must be positive: ${port.id}`);
  }
}

export class InMemorySymbolRegistry implements SymbolRegistry {
  readonly #definitions = new Map<string, SymbolDefinition>();

  public register(definition: SymbolDefinition, options: RegisterOptions = {}): void {
    validateDefinition(definition);
    if (this.#definitions.has(definition.type) && options.replace !== true)
      throw new Error(`Symbol type is already registered: ${definition.type}`);
    this.#definitions.set(definition.type, definition);
  }

  public registerMany(
    definitions: readonly SymbolDefinition[],
    options: RegisterOptions = {}
  ): void {
    definitions.forEach((definition) => {
      this.register(definition, options);
    });
  }

  public unregister(type: string): boolean {
    return this.#definitions.delete(type);
  }

  public get(type: string): SymbolDefinition | undefined {
    return this.#definitions.get(type);
  }

  public has(type: string): boolean {
    return this.#definitions.has(type);
  }

  public getAll(): readonly SymbolDefinition[] {
    return [...this.#definitions.values()];
  }

  public getByCategory(category: string): readonly SymbolDefinition[] {
    return this.getAll().filter((definition) => definition.category === category);
  }

  public clear(): void {
    this.#definitions.clear();
  }
}

const rectanglePorts: readonly PortDefinition[] = [
  {
    id: "inlet",
    label: "Inlet",
    position: { x: 0, y: 0.5 },
    direction: "input",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["output", "bidirectional"]
  },
  {
    id: "outlet",
    label: "Outlet",
    position: { x: 1, y: 0.5 },
    direction: "output",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["input", "bidirectional"]
  }
];
const noPorts: readonly PortDefinition[] = [];

export const RECTANGLE_SYMBOL: SymbolDefinition = {
  type: "basic.rectangle",
  displayNameKey: "symbols.rectangle",
  descriptionKey: "symbols.rectangle.description",
  category: "basic",
  defaultWidth: 120,
  defaultHeight: 80,
  minimumWidth: 10,
  minimumHeight: 10,
  ports: rectanglePorts,
  editableProperties: [
    {
      key: "fill",
      labelKey: "properties.fill",
      kind: "color",
      defaultValue: "#64748b",
      bindable: true
    }
  ],
  bindableProperties: [{ key: "fill", dataTypes: ["string"] }],
  supportedStates: ["normal", "warning", "alarm", "disabled"]
};

export const TEXT_SYMBOL: SymbolDefinition = {
  type: "basic.text",
  displayNameKey: "symbols.text",
  descriptionKey: "symbols.text.description",
  category: "text",
  defaultWidth: 160,
  defaultHeight: 32,
  minimumWidth: 20,
  minimumHeight: 12,
  ports: noPorts,
  editableProperties: [
    {
      key: "text",
      labelKey: "properties.text",
      kind: "text",
      defaultValue: "Label",
      bindable: true
    }
  ],
  bindableProperties: [{ key: "text", dataTypes: ["string", "number"] }],
  supportedStates: ["normal", "disabled"]
};

const equipmentPorts: readonly PortDefinition[] = [
  {
    id: "inlet",
    label: "Inlet",
    position: { x: 0, y: 0.5 },
    direction: "input",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["output", "bidirectional"]
  },
  {
    id: "outlet",
    label: "Outlet",
    position: { x: 1, y: 0.5 },
    direction: "output",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["input", "bidirectional"]
  }
];

function equipmentSymbol(
  type: string,
  category: SymbolCategory,
  width: number,
  height: number,
  ports: readonly PortDefinition[] = equipmentPorts
): SymbolDefinition {
  return {
    type,
    displayNameKey: `symbols.${type.replace("equipment.", "")}`,
    descriptionKey: `symbols.${type.replace("equipment.", "")}.description`,
    category,
    defaultWidth: width,
    defaultHeight: height,
    minimumWidth: 24,
    minimumHeight: 24,
    ports,
    editableProperties: [
      {
        key: "fill",
        labelKey: "properties.fill",
        kind: "color",
        defaultValue: "#64748b",
        bindable: true
      },
      {
        key: "stroke",
        labelKey: "properties.stroke",
        kind: "color",
        defaultValue: "#0f172a"
      },
      {
        key: "labelVisible",
        labelKey: "properties.labelVisible",
        kind: "boolean",
        defaultValue: true
      }
    ],
    bindableProperties: [
      { key: "fill", dataTypes: ["string"] },
      { key: "state", dataTypes: ["string"] }
    ],
    supportedStates: ["normal", "running", "stopped", "warning", "alarm", "offline", "disabled"]
  };
}

export const TANK_SYMBOL = equipmentSymbol("equipment.tank", "tank", 140, 220);
export const PUMP_SYMBOL = equipmentSymbol("equipment.pump", "pump", 120, 90);
export const VALVE_SYMBOL = equipmentSymbol("equipment.valve", "valve", 90, 70);
export const MOTOR_SYMBOL = equipmentSymbol("equipment.motor", "motor", 110, 90, [
  {
    id: "shaft",
    label: "Shaft",
    position: { x: 1, y: 0.5 },
    direction: "output",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["input", "bidirectional"]
  },
  {
    id: "power",
    label: "Power",
    position: { x: 0.5, y: 1 },
    direction: "input",
    medium: "electricity",
    acceptedMediums: [],
    acceptedDirections: ["output", "bidirectional"]
  }
]);
export const SENSOR_SYMBOL = equipmentSymbol("equipment.sensor", "sensor", 72, 72, [
  {
    id: "process",
    label: "Process",
    position: { x: 0.5, y: 1 },
    direction: "input",
    medium: "generic",
    acceptedMediums: [],
    acceptedDirections: ["output", "bidirectional", "passive"]
  },
  {
    id: "signal",
    label: "Signal",
    position: { x: 1, y: 0.5 },
    direction: "output",
    medium: "signal",
    acceptedMediums: [],
    acceptedDirections: ["input", "bidirectional"]
  }
]);
export const INDICATOR_SYMBOL = equipmentSymbol("equipment.indicator", "indicator", 56, 56, [
  {
    id: "signal",
    label: "Signal",
    position: { x: 0, y: 0.5 },
    direction: "input",
    medium: "signal",
    acceptedMediums: [],
    acceptedDirections: ["output", "bidirectional"]
  }
]);

export const INITIAL_SYMBOLS: readonly SymbolDefinition[] = [
  RECTANGLE_SYMBOL,
  TEXT_SYMBOL,
  TANK_SYMBOL,
  PUMP_SYMBOL,
  VALVE_SYMBOL,
  MOTOR_SYMBOL,
  SENSOR_SYMBOL,
  INDICATOR_SYMBOL
];

export function createExampleSymbolRegistry(): InMemorySymbolRegistry {
  const registry = new InMemorySymbolRegistry();
  registry.registerMany(INITIAL_SYMBOLS);
  return registry;
}
