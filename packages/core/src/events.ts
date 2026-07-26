import type { JsonValue } from "./model.js";

export type DomainEventType =
  | "document-created"
  | "document-updated"
  | "layer-added"
  | "layer-updated"
  | "layer-removed"
  | "layers-reordered"
  | "node-added"
  | "node-updated"
  | "node-removed"
  | "node-moved"
  | "node-resized"
  | "node-rotated"
  | "node-reparented"
  | "connection-added"
  | "connection-updated"
  | "connection-removed"
  | "variable-added"
  | "variable-updated"
  | "variable-removed"
  | "binding-added"
  | "binding-updated"
  | "binding-removed"
  | "validation-failed"
  | "document-migrated";

export interface DomainEvent<Type extends DomainEventType = DomainEventType> {
  readonly id: string;
  readonly type: Type;
  readonly timestamp: string;
  readonly documentId: string;
  readonly payload: JsonValue;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}
