import type { SymbolRegistry } from "./validation-context.js";
import {
  SCADA_SCHEMA_VERSION,
  type DocumentVariable,
  type JsonValue,
  type ScadaDocument,
  type VariableDataType
} from "./model.js";
import { checkPortCompatibility } from "./ports.js";

export type ValidationSeverity = "info" | "warning" | "error" | "fatal";

export const CORE_ERROR_CODES = [
  "DOCUMENT_SCHEMA_INVALID",
  "DOCUMENT_VERSION_UNSUPPORTED",
  "DOCUMENT_ID_INVALID",
  "DOCUMENT_NAME_REQUIRED",
  "DOCUMENT_TIMESTAMP_INVALID",
  "CANVAS_WIDTH_INVALID",
  "CANVAS_HEIGHT_INVALID",
  "CANVAS_GRID_SIZE_INVALID",
  "CANVAS_VIEWPORT_INVALID",
  "LAYER_ID_DUPLICATED",
  "LAYER_NOT_FOUND",
  "LAYER_NAME_REQUIRED",
  "LAYER_ORDER_INVALID",
  "NODE_ID_DUPLICATED",
  "NODE_ID_INVALID",
  "NODE_LAYER_NOT_FOUND",
  "NODE_PARENT_NOT_FOUND",
  "NODE_PARENT_SELF_REFERENCE",
  "NODE_PARENT_CYCLE",
  "NODE_SYMBOL_TYPE_REQUIRED",
  "NODE_SYMBOL_NOT_REGISTERED",
  "NODE_POSITION_INVALID",
  "NODE_DIMENSIONS_INVALID",
  "NODE_ROTATION_INVALID",
  "NODE_SCALE_INVALID",
  "NODE_PROPERTIES_INVALID",
  "CONNECTION_ID_DUPLICATED",
  "CONNECTION_LAYER_NOT_FOUND",
  "CONNECTION_SOURCE_NODE_NOT_FOUND",
  "CONNECTION_TARGET_NODE_NOT_FOUND",
  "CONNECTION_SOURCE_PORT_NOT_FOUND",
  "CONNECTION_TARGET_PORT_NOT_FOUND",
  "CONNECTION_ENDPOINTS_IDENTICAL",
  "CONNECTION_ROUTING_INVALID",
  "CONNECTION_WAYPOINT_INVALID",
  "PORT_POSITION_INVALID",
  "PORT_DIRECTION_INCOMPATIBLE",
  "PORT_MEDIUM_INCOMPATIBLE",
  "PORT_MAX_CONNECTIONS_EXCEEDED",
  "VARIABLE_ID_DUPLICATED",
  "VARIABLE_NAME_DUPLICATED",
  "VARIABLE_DATA_TYPE_INVALID",
  "VARIABLE_VALUE_TYPE_MISMATCH",
  "BINDING_ID_DUPLICATED",
  "BINDING_SOURCE_INVALID",
  "BINDING_TARGET_INVALID",
  "BINDING_VARIABLE_NOT_FOUND",
  "SERIALIZATION_FAILED",
  "DESERIALIZATION_FAILED",
  "MIGRATION_PATH_NOT_FOUND",
  "MIGRATION_FAILED"
] as const;

export type ValidationErrorCode = (typeof CORE_ERROR_CODES)[number];

export interface ValidationIssue {
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly path: string;
  readonly severity: ValidationSeverity;
  readonly context: Readonly<Record<string, JsonValue>>;
}

export interface ValidationResult<T = never> {
  readonly valid: boolean;
  readonly value?: T;
  readonly issues: readonly ValidationIssue[];
}

export interface SemanticValidationContext {
  readonly symbolRegistry?: SymbolRegistry;
  readonly strict?: boolean;
}

function issue(
  code: ValidationErrorCode,
  message: string,
  path: string,
  severity: ValidationSeverity = "error",
  context: Readonly<Record<string, JsonValue>> = {}
): ValidationIssue {
  return { code, message, path, severity, context };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

const requiredObjects = ["metadata", "canvas", "runtimeSettings"] as const;
const requiredArrays = ["layers", "nodes", "connections", "variables", "bindings"] as const;

export function validateDocumentStructure(value: unknown): ValidationResult<ScadaDocument> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [issue("DOCUMENT_SCHEMA_INVALID", "Document must be an object.", "", "fatal")]
    };
  }
  if (typeof value.schemaVersion !== "string") {
    issues.push(
      issue("DOCUMENT_SCHEMA_INVALID", "schemaVersion must be a string.", "/schemaVersion", "fatal")
    );
  }
  if (typeof value.id !== "string") {
    issues.push(issue("DOCUMENT_SCHEMA_INVALID", "id must be a string.", "/id", "fatal"));
  }
  for (const key of requiredObjects) {
    if (!isRecord(value[key])) {
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", `${key} must be an object.`, `/${key}`, "fatal")
      );
    }
  }
  for (const key of requiredArrays) {
    if (!Array.isArray(value[key])) {
      issues.push(issue("DOCUMENT_SCHEMA_INVALID", `${key} must be an array.`, `/${key}`, "fatal"));
    }
  }
  if (issues.length > 0) return { valid: false, issues };

  validateMetadata(value.metadata, issues);
  validateCanvas(value.canvas, issues);
  validateLayers(value.layers, issues);
  validateNodes(value.nodes, issues);
  validateConnections(value.connections, issues);
  validateVariables(value.variables, issues);
  validateBindings(value.bindings, issues);
  validateRuntimeSettings(value.runtimeSettings, issues);

  if (value.extensions !== undefined && !isJsonValue(value.extensions)) {
    issues.push(
      issue("DOCUMENT_SCHEMA_INVALID", "extensions must be JSON-safe.", "/extensions", "fatal")
    );
  }
  return issues.length === 0
    ? { valid: true, value: value as unknown as ScadaDocument, issues }
    : { valid: false, issues };
}

function validateMetadata(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) return;
  for (const key of ["name", "createdAt", "updatedAt"] as const) {
    if (typeof value[key] !== "string") {
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", `${key} must be a string.`, `/metadata/${key}`, "fatal")
      );
    }
  }
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string")) {
    issues.push(
      issue("DOCUMENT_SCHEMA_INVALID", "tags must be a string array.", "/metadata/tags", "fatal")
    );
  }
}

function finitePositive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateCanvas(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) return;
  if (!finitePositive(value.width))
    issues.push(issue("CANVAS_WIDTH_INVALID", "Canvas width must be positive.", "/canvas/width"));
  if (!finitePositive(value.height))
    issues.push(
      issue("CANVAS_HEIGHT_INVALID", "Canvas height must be positive.", "/canvas/height")
    );
  if (!finitePositive(value.gridSize))
    issues.push(
      issue("CANVAS_GRID_SIZE_INVALID", "Canvas grid size must be positive.", "/canvas/gridSize")
    );
  if (
    !isRecord(value.defaultViewport) ||
    typeof value.defaultViewport.x !== "number" ||
    !Number.isFinite(value.defaultViewport.x) ||
    typeof value.defaultViewport.y !== "number" ||
    !Number.isFinite(value.defaultViewport.y) ||
    !finitePositive(value.defaultViewport.zoom)
  ) {
    issues.push(
      issue(
        "CANVAS_VIEWPORT_INVALID",
        "Default viewport must contain finite x/y and positive zoom.",
        "/canvas/defaultViewport"
      )
    );
  }
  for (const key of ["background", "coordinateUnit"] as const) {
    if (typeof value[key] !== "string")
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", `${key} must be a string.`, `/canvas/${key}`, "fatal")
      );
  }
  for (const key of ["gridVisible", "snapToGrid"] as const) {
    if (typeof value[key] !== "boolean")
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", `${key} must be boolean.`, `/canvas/${key}`, "fatal")
      );
  }
}

function validateLayers(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((layer, index) => {
    if (
      !isRecord(layer) ||
      typeof layer.id !== "string" ||
      typeof layer.name !== "string" ||
      typeof layer.order !== "number" ||
      !Number.isFinite(layer.order) ||
      typeof layer.visible !== "boolean" ||
      typeof layer.locked !== "boolean"
    ) {
      issues.push(
        issue(
          "DOCUMENT_SCHEMA_INVALID",
          "Layer has an invalid structure.",
          `/layers/${String(index)}`,
          "fatal"
        )
      );
    }
  });
}

function validateNodes(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((node, index) => {
    const path = `/nodes/${String(index)}`;
    if (!isRecord(node) || !isRecord(node.transform)) {
      issues.push(issue("DOCUMENT_SCHEMA_INVALID", "Node must be an object.", path, "fatal"));
      return;
    }
    for (const key of ["id", "name", "symbolType", "layerId"] as const)
      if (typeof node[key] !== "string")
        issues.push(
          issue("DOCUMENT_SCHEMA_INVALID", `${key} must be a string.`, `${path}/${key}`, "fatal")
        );
    for (const key of ["visible", "locked"] as const)
      if (typeof node[key] !== "boolean")
        issues.push(
          issue("DOCUMENT_SCHEMA_INVALID", `${key} must be boolean.`, `${path}/${key}`, "fatal")
        );
    for (const key of ["x", "y", "width", "height", "rotation", "scaleX", "scaleY"] as const)
      if (typeof node.transform[key] !== "number" || !Number.isFinite(node.transform[key]))
        issues.push(
          issue(
            "DOCUMENT_SCHEMA_INVALID",
            `${key} must be finite.`,
            `${path}/transform/${key}`,
            "fatal"
          )
        );
    if (!finitePositive(node.transform.width) || !finitePositive(node.transform.height))
      issues.push(
        issue("NODE_DIMENSIONS_INVALID", "Node dimensions must be positive.", `${path}/transform`)
      );
    if (!isRecord(node.properties) || !isJsonValue(node.properties))
      issues.push(
        issue("NODE_PROPERTIES_INVALID", "Node properties must be JSON-safe.", `${path}/properties`)
      );
    if (!Array.isArray(node.bindings) || !node.bindings.every((id) => typeof id === "string"))
      issues.push(
        issue(
          "DOCUMENT_SCHEMA_INVALID",
          "Node bindings must be a string array.",
          `${path}/bindings`,
          "fatal"
        )
      );
  });
}

function validateConnections(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((connection, index) => {
    const path = `/connections/${String(index)}`;
    if (
      !isRecord(connection) ||
      !isRecord(connection.source) ||
      !isRecord(connection.target) ||
      !isRecord(connection.style)
    ) {
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", "Connection has an invalid structure.", path, "fatal")
      );
      return;
    }
    for (const key of ["id", "name", "routing", "medium", "direction", "layerId"] as const)
      if (typeof connection[key] !== "string")
        issues.push(
          issue("DOCUMENT_SCHEMA_INVALID", `${key} must be a string.`, `${path}/${key}`, "fatal")
        );
    const endpoints = { source: connection.source, target: connection.target };
    for (const endpoint of ["source", "target"] as const)
      for (const key of ["nodeId", "portId"] as const)
        if (typeof endpoints[endpoint][key] !== "string")
          issues.push(
            issue(
              "DOCUMENT_SCHEMA_INVALID",
              `${key} must be a string.`,
              `${path}/${endpoint}/${key}`,
              "fatal"
            )
          );
    if (
      !Array.isArray(connection.waypoints) ||
      !connection.waypoints.every(
        (point) =>
          isRecord(point) &&
          typeof point.x === "number" &&
          Number.isFinite(point.x) &&
          typeof point.y === "number" &&
          Number.isFinite(point.y)
      )
    )
      issues.push(
        issue(
          "CONNECTION_WAYPOINT_INVALID",
          "Connection waypoints must be finite points.",
          `${path}/waypoints`
        )
      );
  });
}

function validateVariables(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((variable, index) => {
    if (
      !isRecord(variable) ||
      typeof variable.id !== "string" ||
      typeof variable.name !== "string" ||
      typeof variable.dataType !== "string" ||
      typeof variable.readonly !== "boolean"
    )
      issues.push(
        issue(
          "DOCUMENT_SCHEMA_INVALID",
          "Variable has an invalid structure.",
          `/variables/${String(index)}`,
          "fatal"
        )
      );
    else if (
      (variable.defaultValue !== undefined && !isJsonValue(variable.defaultValue)) ||
      (variable.value !== undefined && !isJsonValue(variable.value))
    )
      issues.push(
        issue(
          "DOCUMENT_SCHEMA_INVALID",
          "Variable values must be JSON-safe.",
          `/variables/${String(index)}/defaultValue`
        )
      );
  });
}

function validateBindings(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((binding, index) => {
    const path = `/bindings/${String(index)}`;
    if (
      !isRecord(binding) ||
      typeof binding.id !== "string" ||
      !isRecord(binding.source) ||
      !isRecord(binding.target) ||
      binding.mode !== "one-way" ||
      typeof binding.enabled !== "boolean" ||
      !isJsonValue(binding)
    )
      issues.push(
        issue("DOCUMENT_SCHEMA_INVALID", "Binding has an invalid structure.", path, "fatal")
      );
    else {
      const source = binding.source;
      const sourceValid =
        (source.type === "tag" && typeof source.tagId === "string") ||
        (source.type === "variable" && typeof source.variableId === "string") ||
        (source.type === "constant" && isJsonValue(source.value)) ||
        (source.type === "expression" && typeof source.expression === "string");
      if (!sourceValid)
        issues.push(
          issue(
            "BINDING_SOURCE_INVALID",
            "Binding source has an unsupported or malformed structure.",
            `${path}/source`,
            "fatal"
          )
        );
      const target = binding.target;
      const targetValid =
        (target.type === "node-property" &&
          typeof target.nodeId === "string" &&
          typeof target.property === "string") ||
        (target.type === "node-state" && typeof target.nodeId === "string") ||
        (target.type === "connection-property" &&
          typeof target.connectionId === "string" &&
          typeof target.property === "string") ||
        (target.type === "visibility" && typeof target.entityId === "string") ||
        (target.type === "text" && typeof target.nodeId === "string");
      if (!targetValid)
        issues.push(
          issue(
            "BINDING_TARGET_INVALID",
            "Binding target has an unsupported or malformed structure.",
            `${path}/target`,
            "fatal"
          )
        );
    }
  });
}

function validateRuntimeSettings(value: unknown, issues: ValidationIssue[]): void {
  if (
    !isRecord(value) ||
    !finitePositive(value.refreshInterval) ||
    typeof value.defaultQuality !== "string"
  )
    issues.push(
      issue(
        "DOCUMENT_SCHEMA_INVALID",
        "Runtime settings have an invalid structure.",
        "/runtimeSettings",
        "fatal"
      )
    );
}

function duplicates(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const result = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return result;
}

export function detectParentCycles(
  document: Pick<ScadaDocument, "nodes">
): readonly (readonly string[])[] {
  const parentById = new Map(document.nodes.map((node) => [node.id, node.parentId]));
  const visited = new Set<string>();
  const cycles: string[][] = [];
  for (const node of document.nodes) {
    if (visited.has(node.id)) continue;
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: string | undefined = node.id;
    while (current !== undefined && parentById.has(current) && !visited.has(current)) {
      const cycleStart = positions.get(current);
      if (cycleStart !== undefined) {
        cycles.push(path.slice(cycleStart));
        break;
      }
      positions.set(current, path.length);
      path.push(current);
      current = parentById.get(current);
    }
    path.forEach((id) => visited.add(id));
  }
  return cycles;
}

function valueMatchesType(value: JsonValue, type: VariableDataType): boolean {
  if (type === "json") return true;
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  if (type === "date-time") return typeof value === "string" && Number.isFinite(Date.parse(value));
  return typeof value === "string";
}

function validateVariableValue(
  variable: DocumentVariable,
  index: number,
  issues: ValidationIssue[]
): void {
  for (const [field, value] of [
    ["defaultValue", variable.defaultValue],
    ["value", variable.value]
  ] as const) {
    if (value !== undefined && !valueMatchesType(value, variable.dataType))
      issues.push(
        issue(
          "VARIABLE_VALUE_TYPE_MISMATCH",
          `${field} does not match ${variable.dataType}.`,
          `/variables/${String(index)}/${field}`,
          "error",
          { variableId: variable.id }
        )
      );
  }
}

export function validateDocumentSemantics(
  document: ScadaDocument,
  context: SemanticValidationContext = {}
): ValidationResult<ScadaDocument> {
  const issues: ValidationIssue[] = [];
  if (document.schemaVersion !== SCADA_SCHEMA_VERSION)
    issues.push(
      issue(
        "DOCUMENT_VERSION_UNSUPPORTED",
        `Unsupported schema version: ${document.schemaVersion}`,
        "/schemaVersion",
        "fatal"
      )
    );
  if (!document.id.startsWith("doc_"))
    issues.push(issue("DOCUMENT_ID_INVALID", "Document ID must start with doc_.", "/id"));
  if (document.metadata.name.trim() === "")
    issues.push(issue("DOCUMENT_NAME_REQUIRED", "Document name is required.", "/metadata/name"));
  const created = Date.parse(document.metadata.createdAt);
  const updated = Date.parse(document.metadata.updatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(updated) || created > updated)
    issues.push(
      issue(
        "DOCUMENT_TIMESTAMP_INVALID",
        "Document timestamps are invalid or out of order.",
        "/metadata"
      )
    );
  if (document.layers.length === 0)
    issues.push(issue("LAYER_NOT_FOUND", "At least one layer is required.", "/layers"));

  const duplicateLayerIds = duplicates(document.layers.map(({ id }) => id));
  const layerIds = new Set(document.layers.map(({ id }) => id));
  document.layers.forEach((layer, index) => {
    if (duplicateLayerIds.has(layer.id))
      issues.push(
        issue(
          "LAYER_ID_DUPLICATED",
          `Duplicate layer ID: ${layer.id}`,
          `/layers/${String(index)}/id`,
          "error",
          { layerId: layer.id }
        )
      );
    if (layer.name.trim() === "")
      issues.push(
        issue("LAYER_NAME_REQUIRED", "Layer name is required.", `/layers/${String(index)}/name`)
      );
    if (!Number.isInteger(layer.order) || layer.order < 0)
      issues.push(
        issue(
          "LAYER_ORDER_INVALID",
          "Layer order must be a non-negative integer.",
          `/layers/${String(index)}/order`
        )
      );
  });

  const duplicateNodeIds = duplicates(document.nodes.map(({ id }) => id));
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  document.nodes.forEach((node, index) => {
    const path = `/nodes/${String(index)}`;
    if (duplicateNodeIds.has(node.id))
      issues.push(
        issue("NODE_ID_DUPLICATED", `Duplicate node ID: ${node.id}`, `${path}/id`, "error", {
          nodeId: node.id
        })
      );
    if (!node.id.startsWith("node_"))
      issues.push(issue("NODE_ID_INVALID", "Node ID must start with node_.", `${path}/id`));
    if (!layerIds.has(node.layerId))
      issues.push(
        issue(
          "NODE_LAYER_NOT_FOUND",
          `Layer not found: ${node.layerId}`,
          `${path}/layerId`,
          "error",
          { nodeId: node.id, layerId: node.layerId }
        )
      );
    if (node.parentId === node.id)
      issues.push(
        issue(
          "NODE_PARENT_SELF_REFERENCE",
          "Node cannot parent itself.",
          `${path}/parentId`,
          "error",
          { nodeId: node.id }
        )
      );
    else if (node.parentId !== undefined && !nodeById.has(node.parentId))
      issues.push(
        issue(
          "NODE_PARENT_NOT_FOUND",
          `Parent not found: ${node.parentId}`,
          `${path}/parentId`,
          "error",
          { nodeId: node.id, parentId: node.parentId }
        )
      );
    if (node.symbolType.trim() === "")
      issues.push(
        issue("NODE_SYMBOL_TYPE_REQUIRED", "Symbol type is required.", `${path}/symbolType`)
      );
    else if (context.symbolRegistry !== undefined && !context.symbolRegistry.has(node.symbolType))
      issues.push(
        issue(
          "NODE_SYMBOL_NOT_REGISTERED",
          `Symbol is not registered: ${node.symbolType}`,
          `${path}/symbolType`,
          "error",
          { nodeId: node.id, symbolType: node.symbolType }
        )
      );
    if (!Number.isFinite(node.transform.x) || !Number.isFinite(node.transform.y))
      issues.push(
        issue("NODE_POSITION_INVALID", "Node position must be finite.", `${path}/transform`)
      );
    if (
      !Number.isFinite(node.transform.width) ||
      !Number.isFinite(node.transform.height) ||
      node.transform.width <= 0 ||
      node.transform.height <= 0
    )
      issues.push(
        issue("NODE_DIMENSIONS_INVALID", "Node dimensions must be positive.", `${path}/transform`)
      );
    if (!Number.isFinite(node.transform.rotation))
      issues.push(
        issue(
          "NODE_ROTATION_INVALID",
          "Node rotation must be finite.",
          `${path}/transform/rotation`
        )
      );
    if (
      !Number.isFinite(node.transform.scaleX) ||
      !Number.isFinite(node.transform.scaleY) ||
      node.transform.scaleX === 0 ||
      node.transform.scaleY === 0
    )
      issues.push(
        issue("NODE_SCALE_INVALID", "Node scale must be finite and non-zero.", `${path}/transform`)
      );
  });
  for (const cycle of detectParentCycles(document))
    issues.push(
      issue("NODE_PARENT_CYCLE", "Node parent cycle detected.", "/nodes", "error", {
        nodeIds: cycle
      })
    );

  validateConnectionsSemantics(document, layerIds, nodeById, context, issues);
  validateVariablesSemantics(document, issues);
  validateBindingsSemantics(document, nodeById, issues);
  return {
    valid: issues.every(({ severity }) => severity === "info" || severity === "warning"),
    value: document,
    issues
  };
}

function validateConnectionsSemantics(
  document: ScadaDocument,
  layerIds: ReadonlySet<string>,
  nodeById: ReadonlyMap<string, ScadaDocument["nodes"][number]>,
  context: SemanticValidationContext,
  issues: ValidationIssue[]
): void {
  const duplicateIds = duplicates(document.connections.map(({ id }) => id));
  const connectionCounts = new Map<string, number>();
  document.connections.forEach((connection, index) => {
    const path = `/connections/${String(index)}`;
    if (duplicateIds.has(connection.id))
      issues.push(
        issue(
          "CONNECTION_ID_DUPLICATED",
          `Duplicate connection ID: ${connection.id}`,
          `${path}/id`,
          "error",
          { connectionId: connection.id }
        )
      );
    if (!layerIds.has(connection.layerId))
      issues.push(
        issue(
          "CONNECTION_LAYER_NOT_FOUND",
          `Connection layer not found: ${connection.layerId}`,
          `${path}/layerId`
        )
      );
    if (
      connection.source.nodeId === connection.target.nodeId &&
      connection.source.portId === connection.target.portId
    )
      issues.push(
        issue("CONNECTION_ENDPOINTS_IDENTICAL", "Connection endpoints must differ.", path)
      );
    const sourceNode = nodeById.get(connection.source.nodeId);
    const targetNode = nodeById.get(connection.target.nodeId);
    if (sourceNode === undefined)
      issues.push(
        issue(
          "CONNECTION_SOURCE_NODE_NOT_FOUND",
          `Source node not found: ${connection.source.nodeId}`,
          `${path}/source/nodeId`
        )
      );
    if (targetNode === undefined)
      issues.push(
        issue(
          "CONNECTION_TARGET_NODE_NOT_FOUND",
          `Target node not found: ${connection.target.nodeId}`,
          `${path}/target/nodeId`
        )
      );
    if (
      context.symbolRegistry !== undefined &&
      sourceNode !== undefined &&
      targetNode !== undefined
    ) {
      const sourcePort = context.symbolRegistry
        .get(sourceNode.symbolType)
        ?.ports.find(({ id }) => id === connection.source.portId);
      const targetPort = context.symbolRegistry
        .get(targetNode.symbolType)
        ?.ports.find(({ id }) => id === connection.target.portId);
      if (sourcePort === undefined)
        issues.push(
          issue(
            "CONNECTION_SOURCE_PORT_NOT_FOUND",
            `Source port not found: ${connection.source.portId}`,
            `${path}/source/portId`
          )
        );
      if (targetPort === undefined)
        issues.push(
          issue(
            "CONNECTION_TARGET_PORT_NOT_FOUND",
            `Target port not found: ${connection.target.portId}`,
            `${path}/target/portId`
          )
        );
      for (const [endpoint, port] of [
        [connection.source, sourcePort],
        [connection.target, targetPort]
      ] as const) {
        if (port === undefined) continue;
        const key = `${endpoint.nodeId}::${endpoint.portId}`;
        const count = (connectionCounts.get(key) ?? 0) + 1;
        connectionCounts.set(key, count);
        if (port.maxConnections !== undefined && count > port.maxConnections)
          issues.push(
            issue(
              "PORT_MAX_CONNECTIONS_EXCEEDED",
              `Port ${endpoint.portId} exceeds maximum connections.`,
              path,
              "error",
              {
                nodeId: endpoint.nodeId,
                portId: endpoint.portId,
                count,
                maximum: port.maxConnections
              }
            )
          );
      }
      if (sourcePort !== undefined && targetPort !== undefined) {
        const compatibility = checkPortCompatibility(sourcePort, targetPort);
        if (!compatibility.compatible && compatibility.reasonCode !== undefined)
          issues.push(
            issue(compatibility.reasonCode, compatibility.message, path, "error", {
              connectionId: connection.id
            })
          );
      }
    }
  });
}

function validateVariablesSemantics(document: ScadaDocument, issues: ValidationIssue[]): void {
  const duplicateIds = duplicates(document.variables.map(({ id }) => id));
  const duplicateNames = duplicates(document.variables.map(({ name }) => name));
  const validTypes = new Set<VariableDataType>([
    "boolean",
    "integer",
    "number",
    "string",
    "color",
    "date-time",
    "json"
  ]);
  document.variables.forEach((variable, index) => {
    if (duplicateIds.has(variable.id))
      issues.push(
        issue(
          "VARIABLE_ID_DUPLICATED",
          `Duplicate variable ID: ${variable.id}`,
          `/variables/${String(index)}/id`
        )
      );
    if (duplicateNames.has(variable.name))
      issues.push(
        issue(
          "VARIABLE_NAME_DUPLICATED",
          `Duplicate variable name: ${variable.name}`,
          `/variables/${String(index)}/name`
        )
      );
    if (!validTypes.has(variable.dataType))
      issues.push(
        issue(
          "VARIABLE_DATA_TYPE_INVALID",
          `Invalid variable data type: ${variable.dataType}`,
          `/variables/${String(index)}/dataType`
        )
      );
    validateVariableValue(variable, index, issues);
  });
}

function validateBindingsSemantics(
  document: ScadaDocument,
  nodeById: ReadonlyMap<string, ScadaDocument["nodes"][number]>,
  issues: ValidationIssue[]
): void {
  const duplicateIds = duplicates(document.bindings.map(({ id }) => id));
  const variableIds = new Set(document.variables.map(({ id }) => id));
  const connectionIds = new Set(document.connections.map(({ id }) => id));
  document.bindings.forEach((binding, index) => {
    const path = `/bindings/${String(index)}`;
    if (duplicateIds.has(binding.id))
      issues.push(
        issue("BINDING_ID_DUPLICATED", `Duplicate binding ID: ${binding.id}`, `${path}/id`)
      );
    if (binding.source.type === "variable" && !variableIds.has(binding.source.variableId))
      issues.push(
        issue(
          "BINDING_VARIABLE_NOT_FOUND",
          `Binding variable not found: ${binding.source.variableId}`,
          `${path}/source/variableId`
        )
      );
    if (binding.source.type === "tag" && binding.source.tagId.trim() === "")
      issues.push(issue("BINDING_SOURCE_INVALID", "Tag ID is required.", `${path}/source/tagId`));
    if (binding.source.type === "expression" && binding.source.expression.trim() === "")
      issues.push(
        issue("BINDING_SOURCE_INVALID", "Expression text is required.", `${path}/source/expression`)
      );
    if (
      (binding.target.type === "node-property" || binding.target.type === "connection-property") &&
      binding.target.property.trim() === ""
    )
      issues.push(
        issue("BINDING_TARGET_INVALID", "Target property is required.", `${path}/target/property`)
      );
    if (
      ("nodeId" in binding.target && !nodeById.has(binding.target.nodeId)) ||
      (binding.target.type === "visibility" &&
        !nodeById.has(binding.target.entityId) &&
        !connectionIds.has(binding.target.entityId)) ||
      (binding.target.type === "connection-property" &&
        !connectionIds.has(binding.target.connectionId))
    )
      issues.push(
        issue("BINDING_TARGET_INVALID", "Binding target does not exist.", `${path}/target`)
      );
  });
}
