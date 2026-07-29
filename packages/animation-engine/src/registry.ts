import { BUILTIN_ANIMATION_TYPES } from "./contracts.js";
import type {
  AnimationTypeDefinition,
  AnimationTypeId,
  AnimationTypeRegistry
} from "./contracts.js";
import { AnimationRegistrationError } from "./errors.js";

export function asAnimationTypeId(value: string): AnimationTypeId {
  return value as AnimationTypeId;
}

const TARGETS: Readonly<Record<string, readonly string[]>> = {
  blink: ["visibility", "opacity", "fill", "stroke"],
  flash: ["visibility", "opacity", "fill", "stroke"],
  rotate: ["rotation"],
  translate: ["translation"],
  scale: ["scale"],
  opacity: ["opacity"],
  flow: ["flowOffset"],
  transition: ["opacity", "rotation", "translation", "scale", "fill", "stroke"]
};

export class InMemoryAnimationTypeRegistry implements AnimationTypeRegistry {
  readonly #definitions = new Map<AnimationTypeId, AnimationTypeDefinition>();

  public constructor(includeBuiltins = true) {
    if (includeBuiltins)
      for (const [id, displayName] of Object.entries(BUILTIN_ANIMATION_TYPES))
        this.register({
          id: asAnimationTypeId(id),
          displayName,
          supportedTargets: TARGETS[id] ?? []
        });
  }

  public register(definition: AnimationTypeDefinition): void {
    const id = definition.id.trim();
    if (
      id === "" ||
      definition.displayName.trim() === "" ||
      definition.supportedTargets.length === 0
    )
      throw new AnimationRegistrationError("Animation type definition is invalid.", {
        code: "ANIMATION_INVALID_TYPE_REGISTRATION",
        animationId: id
      });
    if (this.#definitions.has(definition.id))
      throw new AnimationRegistrationError(`Animation type is already registered: ${id}`, {
        code: "ANIMATION_DUPLICATE_TYPE",
        animationId: id
      });
    this.#definitions.set(definition.id, Object.freeze({ ...definition }));
  }

  public get(id: AnimationTypeId): AnimationTypeDefinition | undefined {
    return this.#definitions.get(id);
  }

  public has(id: AnimationTypeId): boolean {
    return this.#definitions.has(id);
  }

  public list(): readonly AnimationTypeDefinition[] {
    return Object.freeze([...this.#definitions.values()]);
  }
}
