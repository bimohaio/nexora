export type EntityIdPrefix = "doc" | "node" | "conn" | "layer" | "group" | "bind" | "var" | "tag";

export interface EntityIdGenerator {
  create(prefix: EntityIdPrefix): string;
  createDocumentId(): string;
  createNodeId(): string;
  createConnectionId(): string;
  createLayerId(): string;
  createBindingId(): string;
  createVariableId(): string;
}

export class UlidEntityIdGenerator implements EntityIdGenerator {
  public create(prefix: EntityIdPrefix): string {
    return `${prefix}_${ulid()}`;
  }

  public createDocumentId(): string {
    return this.create("doc");
  }
  public createNodeId(): string {
    return this.create("node");
  }
  public createConnectionId(): string {
    return this.create("conn");
  }
  public createLayerId(): string {
    return this.create("layer");
  }
  public createBindingId(): string {
    return this.create("bind");
  }
  public createVariableId(): string {
    return this.create("var");
  }
}

/** @deprecated Use UlidEntityIdGenerator. */
export const UuidEntityIdGenerator = UlidEntityIdGenerator;

export class DeterministicIdGenerator implements EntityIdGenerator {
  readonly #counts = new Map<EntityIdPrefix, number>();

  public create(prefix: EntityIdPrefix): string {
    const count = (this.#counts.get(prefix) ?? 0) + 1;
    this.#counts.set(prefix, count);
    return `${prefix}_${String(count).padStart(4, "0")}`;
  }

  public createDocumentId(): string {
    return this.create("doc");
  }
  public createNodeId(): string {
    return this.create("node");
  }
  public createConnectionId(): string {
    return this.create("conn");
  }
  public createLayerId(): string {
    return this.create("layer");
  }
  public createBindingId(): string {
    return this.create("bind");
  }
  public createVariableId(): string {
    return this.create("var");
  }
}

export function isEntityId(value: string, prefix: EntityIdPrefix): boolean {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}
import { ulid } from "ulid";
