import type { ScadaConnection, ScadaDocument, ScadaNode, Viewport } from "./model.js";
import type { ValidationResult } from "./validation.js";

export interface DomainEvent<Name extends string, Payload> {
  readonly name: Name;
  readonly timestamp: string;
  readonly payload: Payload;
}

export type ScadaDomainEvent =
  | DomainEvent<"document-changed", { readonly document: ScadaDocument }>
  | DomainEvent<"node-added", { readonly node: ScadaNode }>
  | DomainEvent<"node-updated", { readonly node: ScadaNode }>
  | DomainEvent<"node-removed", { readonly nodeId: string }>
  | DomainEvent<"node-moved", { readonly nodeId: string; readonly x: number; readonly y: number }>
  | DomainEvent<"connection-created", { readonly connection: ScadaConnection }>
  | DomainEvent<"connection-updated", { readonly connection: ScadaConnection }>
  | DomainEvent<"connection-removed", { readonly connectionId: string }>
  | DomainEvent<"selection-changed", { readonly selectedIds: readonly string[] }>
  | DomainEvent<"viewport-changed", { readonly viewport: Viewport }>
  | DomainEvent<"tag-value-changed", { readonly tagId: string; readonly value: unknown }>
  | DomainEvent<"validation-failed", { readonly result: ValidationResult }>;
