import type { BindingDefinition, BindingDependency } from "./contracts.js";
import type { BindingValidationContext, BindingValidationResult } from "./validation.js";

export interface BindingTypeDefinition<TDefinition extends BindingDefinition = BindingDefinition> {
  readonly type: string;
  readonly aliases?: readonly string[];
  readonly validate?: (
    definition: Readonly<TDefinition>,
    context: Readonly<BindingValidationContext>
  ) => BindingValidationResult;
  readonly normalize?: (definition: Readonly<TDefinition>) => TDefinition;
  readonly getDependencies?: (definition: Readonly<TDefinition>) => readonly BindingDependency[];
}

export class DuplicateBindingTypeError extends Error {
  public constructor(public readonly type: string) {
    super(`Binding type is already registered: ${type}`);
    this.name = "DuplicateBindingTypeError";
  }
}

export class BindingTypeRegistry {
  readonly #definitions = new Map<string, BindingTypeDefinition>();
  readonly #canonicalByAlias = new Map<string, string>();

  public register(definition: Readonly<BindingTypeDefinition>): void {
    const canonical = definition.type.trim();
    if (canonical === "") throw new TypeError("Binding type must be a non-empty string.");
    const aliases = [...new Set(definition.aliases?.map((alias) => alias.trim()) ?? [])];
    if (
      this.#definitions.has(canonical) ||
      this.#canonicalByAlias.has(canonical) ||
      aliases.some(
        (alias) =>
          alias === "" ||
          alias === canonical ||
          this.#definitions.has(alias) ||
          this.#canonicalByAlias.has(alias)
      )
    )
      throw new DuplicateBindingTypeError(canonical);
    const snapshot = Object.freeze({
      ...definition,
      type: canonical,
      ...(aliases.length === 0 ? {} : { aliases: Object.freeze(aliases) })
    });
    this.#definitions.set(canonical, snapshot);
    for (const alias of aliases) this.#canonicalByAlias.set(alias, canonical);
  }

  public get(type: string): BindingTypeDefinition | undefined {
    const canonical = this.#canonicalByAlias.get(type) ?? type;
    return this.#definitions.get(canonical);
  }

  public has(type: string): boolean {
    return this.get(type) !== undefined;
  }

  public list(): readonly BindingTypeDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort((left, right) => left.type.localeCompare(right.type))
    );
  }
}
