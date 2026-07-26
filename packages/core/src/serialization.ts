import { normalizeDocument } from "./document.js";
import type { JsonObject, ScadaDocument } from "./model.js";
import { SCADA_SCHEMA_VERSION } from "./model.js";
import type { MigrationRegistry } from "./migrations.js";
import { runMigrations } from "./migrations.js";
import type { SemanticValidationContext, ValidationIssue } from "./validation.js";
import { validateDocumentSemantics, validateDocumentStructure } from "./validation.js";
import { compareSchemaVersions, parseSchemaVersion } from "./version.js";

export type ParseDocumentResult =
  | {
      readonly success: true;
      readonly document: ScadaDocument;
      readonly issues: readonly ValidationIssue[];
      readonly migrated: boolean;
      readonly sourceVersion: string;
      readonly targetVersion: string;
    }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };

export type SerializationResult =
  | { readonly success: true; readonly json: string }
  | { readonly success: false; readonly error: string };

export interface ParseDocumentOptions extends SemanticValidationContext {
  readonly migrations?: MigrationRegistry;
}

function versionIssue(actual: unknown): ValidationIssue {
  return {
    code: "DOCUMENT_VERSION_UNSUPPORTED",
    message: `Unsupported or malformed schema version: ${String(actual)}`,
    path: "/schemaVersion",
    severity: "fatal",
    context: { actual: typeof actual === "string" ? actual : null }
  };
}

export function parseDocument(
  input: unknown,
  options: ParseDocumentOptions = {}
): ParseDocumentResult {
  if (
    typeof input !== "object" ||
    input === null ||
    !("schemaVersion" in input) ||
    typeof input.schemaVersion !== "string"
  )
    return { success: false, issues: [versionIssue(undefined)] };

  const sourceVersion = input.schemaVersion;
  const comparison = compareSchemaVersions(sourceVersion, SCADA_SCHEMA_VERSION);
  if (
    parseSchemaVersion(sourceVersion) === undefined ||
    comparison === undefined ||
    comparison === 1
  )
    return { success: false, issues: [versionIssue(sourceVersion)] };

  let candidate: unknown = input;
  let migrated = false;
  if (comparison === -1) {
    if (options.migrations === undefined)
      return { success: false, issues: [versionIssue(sourceVersion)] };
    try {
      const path = options.migrations.resolvePath(sourceVersion, SCADA_SCHEMA_VERSION);
      candidate = runMigrations(input, path).value;
      migrated = path.length > 0;
    } catch {
      return {
        success: false,
        issues: [
          {
            code: "MIGRATION_PATH_NOT_FOUND",
            message: `No migration path from ${sourceVersion} to ${SCADA_SCHEMA_VERSION}.`,
            path: "/schemaVersion",
            severity: "fatal",
            context: { sourceVersion, targetVersion: SCADA_SCHEMA_VERSION }
          }
        ]
      };
    }
  }
  const structural = validateDocumentStructure(candidate);
  if (!structural.valid || structural.value === undefined)
    return { success: false, issues: structural.issues };
  const document = normalizeDocument(structural.value);
  const semantic = validateDocumentSemantics(document, options);
  if (!semantic.valid) return { success: false, issues: semantic.issues };
  return {
    success: true,
    document,
    issues: semantic.issues,
    migrated,
    sourceVersion,
    targetVersion: SCADA_SCHEMA_VERSION
  };
}

export function parseDocumentJson(
  json: string,
  options: ParseDocumentOptions = {}
): ParseDocumentResult {
  try {
    return parseDocument(JSON.parse(json) as unknown, options);
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          code: "DESERIALIZATION_FAILED",
          message: error instanceof Error ? error.message : "Invalid JSON.",
          path: "",
          severity: "fatal",
          context: {}
        }
      ]
    };
  }
}

export function serializeDocumentData(document: ScadaDocument): JsonObject {
  return JSON.parse(JSON.stringify(document)) as JsonObject;
}

export function serializeDocumentJson(
  document: ScadaDocument,
  pretty = false
): SerializationResult {
  try {
    return {
      success: true,
      json: JSON.stringify(serializeDocumentData(document), undefined, pretty ? 2 : undefined)
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Document serialization failed."
    };
  }
}
