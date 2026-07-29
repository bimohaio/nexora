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
  { id: "process", displayName: "Process", order: 20 },
  { id: "instrumentation", displayName: "Instrumentation", order: 30 },
  { id: "electrical", displayName: "Electrical", order: 40 },
  { id: "bms", displayName: "BMS", order: 50 },
  { id: "safety", displayName: "Safety", order: 60 },
  { id: "network-control", displayName: "Network & Control", order: 70 },
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
