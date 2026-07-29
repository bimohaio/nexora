import type { ExtensionData, JsonValue, PortDefinition } from "@web-scada/core";
import { isNormalizedPoint } from "@web-scada/geometry";
import { INDUSTRIAL_SYMBOLS } from "./industrial-symbols.js";

export type SymbolState =
  | "normal"
  | "active"
  | "inactive"
  | "running"
  | "stopped"
  | "warning"
  | "alarm"
  | "offline"
  | "disabled";

export type SymbolRuntimeCapability =
  | Exclude<SymbolState, "normal">
  | "open"
  | "enabled"
  | "level"
  | "speed"
  | "flow"
  | "direction"
  | "text"
  | "value"
  | "rotation"
  | "animation";

export type SymbolCapability =
  | "resizable"
  | "rotatable"
  | "connectable"
  | "text-editable"
  | "runtime-bindable"
  | "supports-state"
  | "supports-value"
  | "supports-direction"
  | "supports-level"
  | "supports-open-percentage"
  | "animation-compatible"
  | "alarm-visual-compatible";

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
  | "process"
  | "instrumentation"
  | "bms"
  | "safety"
  | "network-control"
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
  readonly version?: number;
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
  readonly runtimeCapabilities?: readonly SymbolRuntimeCapability[];
  /**
   * Renderer-neutral Phase 10 targets. Definitions declare intent only and
   * never own clocks, timers, subscriptions or renderer elements.
   */
  readonly phase10Capabilities?: {
    readonly animationTargets?: readonly string[];
    readonly alarmVisualTargets?: readonly string[];
    readonly parts?: readonly string[];
  };
  readonly capabilities?: readonly SymbolCapability[];
  readonly tags?: readonly string[];
  readonly presets?: readonly SymbolPreset[];
  readonly aliases?: readonly string[];
  readonly deprecation?: SymbolDeprecation;
  readonly metadata?: ExtensionData;
}

export interface SymbolPreset {
  readonly id: string;
  readonly displayNameKey: string;
  readonly properties: Readonly<Record<string, JsonValue>>;
}

export interface SymbolDeprecation {
  readonly deprecated: boolean;
  readonly message?: string;
  readonly replacedBy?: string;
}

export interface RegisterOptions {
  readonly replace?: boolean;
}

export interface SymbolRegistry {
  register(definition: SymbolDefinition, options?: RegisterOptions): void;
  registerMany(definitions: readonly SymbolDefinition[], options?: RegisterOptions): void;
  unregister(type: string): boolean;
  get(type: string): SymbolDefinition | undefined;
  require(type: string): SymbolDefinition;
  has(type: string): boolean;
  getAll(): readonly SymbolDefinition[];
  list(): readonly SymbolDefinition[];
  getByCategory(category: string): readonly SymbolDefinition[];
  listByCategory(category: string): readonly SymbolDefinition[];
  resolveType(typeOrAlias: string): string | undefined;
  search(query: SymbolSearchQuery): readonly SymbolDefinition[];
  validate(): SymbolRegistryValidationResult;
  clear(): void;
}

export interface SymbolSearchQuery {
  readonly text?: string;
  readonly category?: string;
  readonly capability?: SymbolCapability | SymbolRuntimeCapability;
  readonly tag?: string;
  readonly includeDeprecated?: boolean;
}

export interface SymbolRegistryDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly symbolType?: string;
  readonly message: string;
}

export interface SymbolRegistryValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly SymbolRegistryDiagnostic[];
}

export interface AliasAwareSymbolRegistry extends SymbolRegistry {
  getCanonicalType(typeOrAlias: string): string | undefined;
  getAliases(type: string): readonly string[];
  isAlias(type: string): boolean;
}

function validateDefinition(definition: SymbolDefinition): void {
  if (definition.type.trim() === "") throw new Error("Symbol type is required.");
  const aliases = definition.aliases ?? [];
  const uniqueAliases = new Set(aliases);
  if (uniqueAliases.size !== aliases.length)
    throw new Error(`Duplicate symbol alias: ${definition.type}`);
  if (aliases.some((alias) => alias.trim() === "" || alias === definition.type))
    throw new Error(`Invalid symbol alias: ${definition.type}`);
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
  const propertyKeys = new Set<string>();
  for (const property of definition.editableProperties) {
    if (propertyKeys.has(property.key))
      throw new Error(`Duplicate property key: ${definition.type}:${property.key}`);
    propertyKeys.add(property.key);
    if (
      typeof property.defaultValue === "number" &&
      ((property.minimum !== undefined && property.defaultValue < property.minimum) ||
        (property.maximum !== undefined && property.defaultValue > property.maximum))
    )
      throw new Error(`Property default is out of range: ${definition.type}:${property.key}`);
  }
  const supportedStates = new Set(definition.supportedStates);
  if (supportedStates.size !== definition.supportedStates.length)
    throw new Error(`Duplicate supported state: ${definition.type}`);
  for (const capability of definition.runtimeCapabilities ?? [])
    if (
      [
        "active",
        "inactive",
        "running",
        "stopped",
        "warning",
        "alarm",
        "offline",
        "disabled"
      ].includes(capability) &&
      !supportedStates.has(capability as SymbolState)
    )
      throw new Error(
        `Runtime capability must be included in supported states: ${definition.type}:${capability}`
      );
  for (const target of [
    ...(definition.phase10Capabilities?.animationTargets ?? []),
    ...(definition.phase10Capabilities?.alarmVisualTargets ?? []),
    ...(definition.phase10Capabilities?.parts ?? [])
  ])
    if (target.trim() === "" || ["__proto__", "prototype", "constructor"].includes(target))
      throw new Error(`Invalid Phase 10 symbol target: ${definition.type}`);
  if (
    definition.deprecation?.deprecated === true &&
    definition.deprecation.replacedBy === definition.type
  )
    throw new Error(`Deprecated symbol cannot replace itself: ${definition.type}`);
}

export class InMemorySymbolRegistry implements AliasAwareSymbolRegistry {
  readonly #definitions = new Map<string, SymbolDefinition>();
  readonly #aliases = new Map<string, string>();

  public register(definition: SymbolDefinition, options: RegisterOptions = {}): void {
    validateDefinition(definition);
    if (this.#definitions.has(definition.type) && options.replace !== true)
      throw new Error(`Symbol type is already registered: ${definition.type}`);
    const aliases = definition.aliases ?? [];
    for (const alias of aliases) {
      const owner = this.#aliases.get(alias);
      if (this.#definitions.has(alias) || (owner !== undefined && owner !== definition.type))
        throw new Error(`Symbol alias is already registered: ${alias}`);
    }
    const canonicalAliasOwner = this.#aliases.get(definition.type);
    if (canonicalAliasOwner !== undefined && canonicalAliasOwner !== definition.type)
      throw new Error(`Symbol type conflicts with registered alias: ${definition.type}`);
    if (options.replace === true) this.#removeAliases(definition.type);
    this.#definitions.set(definition.type, definition);
    for (const alias of aliases) this.#aliases.set(alias, definition.type);
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
    const canonicalType = this.getCanonicalType(type);
    if (canonicalType === undefined) return false;
    this.#removeAliases(canonicalType);
    return this.#definitions.delete(canonicalType);
  }

  public get(type: string): SymbolDefinition | undefined {
    const canonicalType = this.getCanonicalType(type);
    return canonicalType === undefined ? undefined : this.#definitions.get(canonicalType);
  }

  public require(type: string): SymbolDefinition {
    const definition = this.get(type);
    if (definition === undefined) throw new Error(`Unknown symbol type: ${type}`);
    return definition;
  }

  public has(type: string): boolean {
    return this.getCanonicalType(type) !== undefined;
  }

  public getAll(): readonly SymbolDefinition[] {
    return Object.freeze([...this.#definitions.values()]);
  }

  public list(): readonly SymbolDefinition[] {
    return this.getAll();
  }

  public getByCategory(category: string): readonly SymbolDefinition[] {
    return Object.freeze(this.getAll().filter((definition) => definition.category === category));
  }

  public listByCategory(category: string): readonly SymbolDefinition[] {
    return this.getByCategory(category);
  }

  public resolveType(typeOrAlias: string): string | undefined {
    return this.getCanonicalType(typeOrAlias);
  }

  public search(query: SymbolSearchQuery): readonly SymbolDefinition[] {
    const text = query.text?.trim().toLocaleLowerCase();
    return Object.freeze(
      this.getAll().filter((definition) => {
        if (query.includeDeprecated !== true && definition.deprecation?.deprecated === true)
          return false;
        if (query.category !== undefined && definition.category !== query.category) return false;
        if (
          query.capability !== undefined &&
          !definition.capabilities?.includes(query.capability as SymbolCapability) &&
          !definition.runtimeCapabilities?.includes(query.capability as SymbolRuntimeCapability)
        )
          return false;
        if (query.tag !== undefined && !definition.tags?.includes(query.tag)) return false;
        if (text === undefined || text === "") return true;
        return [
          definition.type,
          definition.displayNameKey,
          definition.descriptionKey ?? "",
          ...(definition.aliases ?? []),
          ...(definition.tags ?? [])
        ].some((value) => value.toLocaleLowerCase().includes(text));
      })
    );
  }

  public validate(): SymbolRegistryValidationResult {
    const diagnostics: SymbolRegistryDiagnostic[] = [];
    for (const definition of this.#definitions.values()) {
      try {
        validateDefinition(definition);
      } catch (error) {
        diagnostics.push({
          severity: "error",
          code: "invalid-definition",
          symbolType: definition.type,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      const replacement = definition.deprecation?.replacedBy;
      if (replacement !== undefined && !this.has(replacement))
        diagnostics.push({
          severity: "warning",
          code: "missing-deprecation-replacement",
          symbolType: definition.type,
          message: `Deprecation replacement is not registered: ${replacement}`
        });
    }
    return Object.freeze({
      valid: !diagnostics.some(({ severity }) => severity === "error"),
      diagnostics: Object.freeze(diagnostics)
    });
  }

  public getCanonicalType(typeOrAlias: string): string | undefined {
    if (this.#definitions.has(typeOrAlias)) return typeOrAlias;
    return this.#aliases.get(typeOrAlias);
  }

  public getAliases(type: string): readonly string[] {
    const canonicalType = this.getCanonicalType(type);
    if (canonicalType === undefined) return [];
    return [...this.#aliases]
      .filter(([, owner]) => owner === canonicalType)
      .map(([alias]) => alias);
  }

  public isAlias(type: string): boolean {
    return this.#aliases.has(type);
  }

  public clear(): void {
    this.#definitions.clear();
    this.#aliases.clear();
  }

  #removeAliases(canonicalType: string): void {
    for (const [alias, owner] of this.#aliases)
      if (owner === canonicalType) this.#aliases.delete(alias);
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

const tankBase = equipmentSymbol("equipment.tank", "tank", 140, 220);
export const TANK_SYMBOL: SymbolDefinition = {
  ...tankBase,
  editableProperties: [
    ...tankBase.editableProperties,
    {
      key: "level",
      labelKey: "properties.level",
      kind: "number",
      defaultValue: 0,
      minimum: 0,
      maximum: 1,
      bindable: true
    }
  ],
  bindableProperties: [...tankBase.bindableProperties, { key: "level", dataTypes: ["number"] }]
};
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

export const ALL_SYMBOLS: readonly SymbolDefinition[] = [...INITIAL_SYMBOLS, ...INDUSTRIAL_SYMBOLS];

export function createIndustrialSymbolRegistry(): InMemorySymbolRegistry {
  const registry = new InMemorySymbolRegistry();
  registry.registerMany(ALL_SYMBOLS);
  return registry;
}

export function createExampleSymbolRegistry(): InMemorySymbolRegistry {
  return createIndustrialSymbolRegistry();
}
