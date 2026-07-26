import { SCADA_SCHEMA_VERSION, type ScadaDocument } from "./model.js";

export type ValidationSeverity = "info" | "warning" | "error" | "fatal";

export type ValidationErrorCode =
  | "DOCUMENT_SCHEMA_INVALID"
  | "DOCUMENT_VERSION_UNSUPPORTED"
  | "NODE_ID_DUPLICATED"
  | "NODE_LAYER_NOT_FOUND"
  | "NODE_PARENT_NOT_FOUND"
  | "NODE_PARENT_CYCLE"
  | "NODE_DIMENSIONS_INVALID"
  | "NODE_ROTATION_INVALID"
  | "SYMBOL_TYPE_NOT_REGISTERED"
  | "CONNECTION_ID_DUPLICATED"
  | "CONNECTION_SOURCE_NODE_NOT_FOUND"
  | "CONNECTION_TARGET_NODE_NOT_FOUND"
  | "CONNECTION_SOURCE_PORT_NOT_FOUND"
  | "CONNECTION_TARGET_PORT_NOT_FOUND"
  | "PORT_DIRECTION_INCOMPATIBLE"
  | "PORT_MEDIUM_INCOMPATIBLE"
  | "PORT_MAX_CONNECTIONS_EXCEEDED";

export interface ValidationIssue {
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly path: string;
  readonly severity: ValidationSeverity;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface DocumentValidator {
  validate(value: unknown): ValidationResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateDocumentStructure(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    issues.push({
      code: "DOCUMENT_SCHEMA_INVALID",
      message: "Document must be an object.",
      path: "$",
      severity: "fatal",
      context: {}
    });
    return { valid: false, issues };
  }

  if (value.schemaVersion !== SCADA_SCHEMA_VERSION) {
    issues.push({
      code: "DOCUMENT_VERSION_UNSUPPORTED",
      message: `Expected schema version ${SCADA_SCHEMA_VERSION}.`,
      path: "$.schemaVersion",
      severity: "fatal",
      context: { actual: value.schemaVersion }
    });
  }

  for (const key of ["layers", "nodes", "connections", "variables", "bindings"] as const) {
    if (!Array.isArray(value[key])) {
      issues.push({
        code: "DOCUMENT_SCHEMA_INVALID",
        message: `${key} must be an array.`,
        path: `$.${key}`,
        severity: "fatal",
        context: {}
      });
    }
  }

  for (const key of ["id", "metadata", "canvas", "runtimeSettings"] as const) {
    if (value[key] === undefined) {
      issues.push({
        code: "DOCUMENT_SCHEMA_INVALID",
        message: `${key} is required.`,
        path: `$.${key}`,
        severity: "fatal",
        context: {}
      });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateDocumentSemantics(document: ScadaDocument): ValidationResult {
  const issues: ValidationIssue[] = [];
  const layerIds = new Set(document.layers.map(({ id }) => id));
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();

  document.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "NODE_ID_DUPLICATED",
        message: `Duplicate node ID: ${node.id}`,
        path: `$.nodes[${String(index)}].id`,
        severity: "error",
        context: { nodeId: node.id }
      });
    }
    nodeIds.add(node.id);
    if (!layerIds.has(node.layerId)) {
      issues.push({
        code: "NODE_LAYER_NOT_FOUND",
        message: `Layer not found: ${node.layerId}`,
        path: `$.nodes[${String(index)}].layerId`,
        severity: "error",
        context: { nodeId: node.id, layerId: node.layerId }
      });
    }
  });

  document.connections.forEach((connection, index) => {
    if (connectionIds.has(connection.id)) {
      issues.push({
        code: "CONNECTION_ID_DUPLICATED",
        message: `Duplicate connection ID: ${connection.id}`,
        path: `$.connections[${String(index)}].id`,
        severity: "error",
        context: { connectionId: connection.id }
      });
    }
    connectionIds.add(connection.id);
    for (const [endpoint, code] of [
      ["source", "CONNECTION_SOURCE_NODE_NOT_FOUND"],
      ["target", "CONNECTION_TARGET_NODE_NOT_FOUND"]
    ] as const) {
      if (!nodeIds.has(connection[endpoint].nodeId)) {
        issues.push({
          code,
          message: `${endpoint} node not found: ${connection[endpoint].nodeId}`,
          path: `$.connections[${String(index)}].${endpoint}.nodeId`,
          severity: "error",
          context: { connectionId: connection.id, nodeId: connection[endpoint].nodeId }
        });
      }
    }
  });
  return { valid: issues.length === 0, issues };
}
