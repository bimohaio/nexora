import { AnimationRegistrationError } from "./errors.js";
import type {
  AnimationPrimitive,
  PrimitiveId,
  PrimitiveMetadata,
  PrimitiveRegistration
} from "./primitive-contracts.js";

export interface PrimitiveRegistrySnapshot {
  readonly registrations: readonly PrimitiveMetadata[];
  readonly aliases: Readonly<Record<string, PrimitiveId>>;
  readonly duplicateAttempts: number;
  readonly unknownRequests: number;
  readonly deprecatedRequests: number;
}

interface StoredRegistration {
  readonly metadata: PrimitiveMetadata;
  readonly factory: () => AnimationPrimitive<unknown>;
}

function canonicalId(id: PrimitiveId): PrimitiveId {
  if (!/^animation\.[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id))
    throw new AnimationRegistrationError(`Primitive ID '${id}' is invalid.`, {
      code: "INVALID_ANIMATION_CONFIGURATION",
      animationId: id
    });
  return id;
}

function cloneMetadata(metadata: PrimitiveMetadata): PrimitiveMetadata {
  return Object.freeze({
    ...metadata,
    supportedDirections: Object.freeze([...metadata.supportedDirections]),
    supportedFillModes: Object.freeze([...metadata.supportedFillModes]),
    supportedInterpolations: Object.freeze([...metadata.supportedInterpolations]),
    ...(metadata.aliases === undefined ? {} : { aliases: Object.freeze([...metadata.aliases]) })
  });
}

/**
 * Instance-scoped authoritative primitive registry. It stores immutable metadata and factories,
 * never playback state. Registration order is excluded from lookup behavior.
 */
export class AnimationPrimitiveRegistry {
  readonly #registrations = new Map<PrimitiveId, StoredRegistration>();
  readonly #aliases = new Map<PrimitiveId, PrimitiveId>();
  #duplicateAttempts = 0;
  #unknownRequests = 0;
  #deprecatedRequests = 0;

  public register<T>(registration: Readonly<PrimitiveRegistration<T>>): void {
    const metadata = cloneMetadata(registration.metadata);
    const id = canonicalId(metadata.id);
    if (
      typeof registration.factory !== "function" ||
      metadata.displayName.trim() === "" ||
      metadata.description.trim() === "" ||
      metadata.version.trim() === "" ||
      metadata.engineCompatibility.trim() === ""
    )
      throw new AnimationRegistrationError(`Primitive '${id}' registration is incomplete.`, {
        code: "INVALID_ANIMATION_CONFIGURATION",
        animationId: id
      });
    const aliases = metadata.aliases ?? [];
    if (
      this.#registrations.has(id) ||
      this.#aliases.has(id) ||
      aliases.some((alias) => this.#registrations.has(alias) || this.#aliases.has(alias))
    ) {
      this.#duplicateAttempts += 1;
      throw new AnimationRegistrationError(`Primitive '${id}' is already registered.`, {
        code: "ANIMATION_DUPLICATE_REGISTRATION",
        animationId: id
      });
    }
    for (const alias of aliases) {
      canonicalId(alias);
      if (alias === id)
        throw new AnimationRegistrationError("A primitive cannot alias itself.", {
          code: "ANIMATION_DUPLICATE_REGISTRATION",
          animationId: id
        });
    }
    this.#registrations.set(id, {
      metadata,
      factory: registration.factory as () => AnimationPrimitive<unknown>
    });
    for (const alias of aliases) this.#aliases.set(alias, id);
  }

  public unregister(id: PrimitiveId): boolean {
    const canonical = this.#aliases.get(id) ?? id;
    const registration = this.#registrations.get(canonical);
    if (registration === undefined) return false;
    this.#registrations.delete(canonical);
    for (const alias of registration.metadata.aliases ?? []) this.#aliases.delete(alias);
    return true;
  }

  public has(id: PrimitiveId): boolean {
    return this.#registrations.has(this.#aliases.get(id) ?? id);
  }

  public resolve<T>(id: PrimitiveId): Readonly<PrimitiveRegistration<T>> {
    const canonical = this.#aliases.get(id) ?? id;
    const registration = this.#registrations.get(canonical);
    if (registration === undefined) {
      this.#unknownRequests += 1;
      throw new AnimationRegistrationError(`Primitive '${id}' is not registered.`, {
        code: "ANIMATION_PRIMITIVE_NOT_FOUND",
        animationId: id
      });
    }
    if (registration.metadata.deprecated === true || canonical !== id)
      this.#deprecatedRequests += 1;
    return Object.freeze({
      metadata: registration.metadata,
      factory: registration.factory as () => AnimationPrimitive<T>
    });
  }

  public list(): readonly PrimitiveMetadata[] {
    return Object.freeze(
      [...this.#registrations.values()]
        .map(({ metadata }) => metadata)
        .sort((left, right) => left.id.localeCompare(right.id))
    );
  }

  public snapshot(): PrimitiveRegistrySnapshot {
    return Object.freeze({
      registrations: this.list(),
      aliases: Object.freeze(Object.fromEntries([...this.#aliases.entries()].sort())),
      duplicateAttempts: this.#duplicateAttempts,
      unknownRequests: this.#unknownRequests,
      deprecatedRequests: this.#deprecatedRequests
    });
  }
}

export const asPrimitiveId = (value: string): PrimitiveId => value as PrimitiveId;
