import type { PortDefinition } from "./ports.js";

export interface ValidationSymbolDefinition {
  readonly type: string;
  readonly ports: readonly PortDefinition[];
}

export interface SymbolRegistry {
  has(type: string): boolean;
  get(type: string): ValidationSymbolDefinition | undefined;
}
