import type { JsonValue, PortDefinition } from "@web-scada/core";

export type SymbolState =
  "normal" | "running" | "stopped" | "warning" | "alarm" | "offline" | "disabled";

export type PropertyEditorType =
  "text" | "number" | "boolean" | "color" | "select" | "unit" | "binding" | "readonly";

export interface PropertyOption {
  readonly value: JsonValue;
  readonly labelKey: string;
}

export interface PropertyMetadata {
  readonly name: string;
  readonly labelKey: string;
  readonly type: PropertyEditorType;
  readonly defaultValue?: JsonValue;
  readonly required?: boolean;
  readonly options?: readonly PropertyOption[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface BindablePropertyMetadata {
  readonly name: string;
  readonly dataTypes: readonly ("boolean" | "number" | "string")[];
}

export interface SymbolDefinition {
  readonly type: string;
  readonly displayNameKey: string;
  readonly category: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly minimumWidth: number;
  readonly minimumHeight: number;
  readonly ports: readonly PortDefinition[];
  readonly editableProperties: readonly PropertyMetadata[];
  readonly bindableProperties: readonly BindablePropertyMetadata[];
  readonly supportedStates: readonly SymbolState[];
  readonly rendererId: string;
}

export interface SymbolRegistry {
  register(definition: SymbolDefinition): void;
  unregister(type: string): boolean;
  get(type: string): SymbolDefinition | undefined;
  has(type: string): boolean;
  getAll(): readonly SymbolDefinition[];
  getByCategory(category: string): readonly SymbolDefinition[];
}

export class InMemorySymbolRegistry implements SymbolRegistry {
  readonly #definitions = new Map<string, SymbolDefinition>();

  public register(definition: SymbolDefinition): void {
    if (this.#definitions.has(definition.type)) {
      throw new Error(`Symbol type is already registered: ${definition.type}`);
    }
    this.#definitions.set(definition.type, definition);
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
}
