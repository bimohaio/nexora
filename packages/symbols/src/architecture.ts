import type { SymbolCategory, SymbolDefinition, SymbolRegistry } from "./symbol.js";

export interface SymbolPackDependency {
  readonly id: string;
  readonly version?: string;
}

export interface SymbolPack {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly definitions: readonly SymbolDefinition[];
  readonly dependencies?: readonly SymbolPackDependency[];
}

export interface SymbolCategoryDefinition {
  readonly id: SymbolCategory;
  readonly displayName: string;
  readonly description?: string;
  readonly order?: number;
  readonly iconKey?: string;
  readonly parentId?: SymbolCategory;
  readonly tags?: readonly string[];
}

export class SymbolCategoryRegistry {
  readonly #categories = new Map<string, SymbolCategoryDefinition>();

  public register(category: SymbolCategoryDefinition): void {
    if (category.id.trim() === "") throw new Error("Symbol category ID is required.");
    if (this.#categories.has(category.id))
      throw new Error(`Symbol category is already registered: ${category.id}`);
    this.#categories.set(category.id, Object.freeze({ ...category }));
  }

  public registerMany(categories: readonly SymbolCategoryDefinition[]): void {
    for (const category of categories) this.register(category);
  }

  public get(id: string): SymbolCategoryDefinition | undefined {
    return this.#categories.get(id);
  }

  public list(): readonly SymbolCategoryDefinition[] {
    return Object.freeze(
      [...this.#categories.values()].sort(
        (left, right) =>
          (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
          left.id.localeCompare(right.id)
      )
    );
  }

  public validate(): readonly string[] {
    const diagnostics: string[] = [];
    for (const category of this.#categories.values())
      if (category.parentId !== undefined && !this.#categories.has(category.parentId))
        diagnostics.push(`Unknown parent category: ${category.id}:${category.parentId}`);
    return Object.freeze(diagnostics);
  }
}

export const STANDARD_SYMBOL_CATEGORIES: readonly SymbolCategoryDefinition[] = Object.freeze([
  { id: "basic", displayName: "Basic", order: 10 },
  {
    id: "indicators-alarms",
    displayName: "Indicators and Alarms",
    order: 20,
    tags: ["status", "alarm", "lamp"]
  },
  {
    id: "hmi-controls",
    displayName: "Buttons and HMI Controls",
    order: 30,
    tags: ["button", "switch", "command"]
  },
  { id: "valves", displayName: "Valves", order: 40, tags: ["flow", "process"] },
  { id: "pumps", displayName: "Pumps", order: 50, tags: ["flow", "process"] },
  {
    id: "motors-drives",
    displayName: "Motors and Drives",
    order: 60,
    tags: ["motor", "drive"]
  },
  {
    id: "pipes-connectors",
    displayName: "Pipes and Connectors",
    order: 70,
    tags: ["pipe", "connection", "flow"]
  },
  {
    id: "tanks-vessels",
    displayName: "Tanks and Vessels",
    order: 80,
    tags: ["tank", "vessel", "storage"]
  },
  {
    id: "conveyors-material-handling",
    displayName: "Conveyors and Material Handling",
    order: 90,
    tags: ["conveyor", "material"]
  },
  {
    id: "process-equipment",
    displayName: "Process Equipment",
    order: 100,
    tags: ["process", "equipment"]
  },
  {
    id: "instruments-sensors",
    displayName: "Instruments and Sensors",
    order: 110,
    tags: ["instrument", "sensor", "measurement"]
  },
  { id: "electrical", displayName: "Electrical", order: 120, tags: ["power", "control"] },
  { id: "hvac", displayName: "HVAC", order: 130, tags: ["air", "ventilation"] },
  {
    id: "displays-visualization",
    displayName: "Displays and Visualization",
    order: 140,
    tags: ["display", "chart", "gauge"]
  },
  {
    id: "navigation-layout",
    displayName: "Navigation and Layout",
    order: 150,
    tags: ["navigation", "layout", "container"]
  },
  {
    id: "utilities-authoring",
    displayName: "Utilities and Authoring Helpers",
    order: 160,
    tags: ["authoring", "helper", "annotation"]
  },
  {
    id: "robotics-automation",
    displayName: "Robotics and Factory Automation",
    order: 170,
    tags: ["robot", "factory", "automation"]
  },
  {
    id: "oil-gas",
    displayName: "Oil and Gas",
    order: 180,
    tags: ["oil", "gas", "pipeline"]
  },
  { id: "process", displayName: "Process", order: 900 },
  { id: "instrumentation", displayName: "Instrumentation", order: 910 },
  { id: "bms", displayName: "BMS", order: 920 },
  { id: "safety", displayName: "Safety", order: 930 },
  { id: "network-control", displayName: "Network & Control", order: 940 },
  { id: "custom", displayName: "Custom", order: 1000 }
]);

export function createStandardSymbolCategoryRegistry(): SymbolCategoryRegistry {
  const registry = new SymbolCategoryRegistry();
  registry.registerMany(STANDARD_SYMBOL_CATEGORIES);
  return registry;
}

export function defineSymbol<T extends SymbolDefinition>(definition: T): Readonly<T> {
  return Object.freeze(definition);
}

export function defineSymbolPack<T extends SymbolPack>(pack: T): Readonly<T> {
  return Object.freeze({ ...pack, definitions: Object.freeze([...pack.definitions]) });
}

export function registerSymbolPack(registry: SymbolRegistry, pack: SymbolPack): void {
  registry.registerMany(pack.definitions);
}
