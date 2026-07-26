import type { JsonObject, ScadaDocument } from "./model.js";
import type { ValidationResult } from "./validation.js";

export interface DocumentSerializer {
  serialize(document: ScadaDocument): JsonObject;
}

export interface DocumentParser {
  parse(input: unknown): DocumentParseResult;
}

export type DocumentParseResult =
  | { readonly success: true; readonly document: ScadaDocument }
  | { readonly success: false; readonly validation: ValidationResult };

export interface DocumentNormalizer {
  normalize(document: ScadaDocument): ScadaDocument;
}

export interface MigrationResult {
  readonly value: unknown;
  readonly fromVersion: string;
  readonly toVersion: string;
}

export interface DocumentMigration {
  readonly fromVersion: string;
  readonly toVersion: string;
  migrate(value: unknown): MigrationResult;
}

export interface DocumentMigrationRegistry {
  register(migration: DocumentMigration): void;
  findPath(fromVersion: string, toVersion: string): readonly DocumentMigration[];
}
