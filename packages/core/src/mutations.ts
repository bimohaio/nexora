import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import { createEmptyChangeSet, type DocumentChangeSet } from "./change-set.js";
import type { DomainEvent, DomainEventType } from "./events.js";
import type { EntityIdGenerator } from "./ids.js";
import { UlidEntityIdGenerator } from "./ids.js";
import type { JsonValue, ScadaConnection, ScadaDocument, ScadaLayer, ScadaNode } from "./model.js";
import type {
  SemanticValidationContext,
  ValidationErrorCode,
  ValidationIssue
} from "./validation.js";
import { validateDocumentSemantics } from "./validation.js";

export interface MutationOptions extends SemanticValidationContext {
  readonly clock?: Clock;
  readonly idGenerator?: EntityIdGenerator;
}

export type DocumentMutationResult =
  | {
      readonly success: true;
      readonly document: ScadaDocument;
      readonly changes: DocumentChangeSet;
      readonly events: readonly DomainEvent[];
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly success: false;
      readonly document: ScadaDocument;
      readonly issues: readonly ValidationIssue[];
    };

function failure(
  document: ScadaDocument,
  code: ValidationErrorCode,
  message: string,
  path: string
): DocumentMutationResult {
  return {
    success: false,
    document,
    issues: [{ code, message, path, severity: "error", context: {} }]
  };
}

function complete(
  original: ScadaDocument,
  next: ScadaDocument,
  changes: DocumentChangeSet,
  eventType: DomainEventType,
  payload: JsonValue,
  options: MutationOptions
): DocumentMutationResult {
  const clock = options.clock ?? new SystemClock();
  const now = clock.now();
  const updated: ScadaDocument = {
    ...next,
    metadata: { ...next.metadata, updatedAt: now }
  };
  const validation = validateDocumentSemantics(updated, options);
  if (!validation.valid) return { success: false, document: original, issues: validation.issues };
  const ids = options.idGenerator ?? new UlidEntityIdGenerator();
  return {
    success: true,
    document: updated,
    changes: { ...changes, metadataChanged: true },
    events: [
      {
        id: ids.create("group"),
        type: eventType,
        timestamp: now,
        documentId: original.id,
        payload,
        metadata: {}
      }
    ],
    issues: validation.issues
  };
}

export function addNode(
  document: ScadaDocument,
  node: ScadaNode,
  options: MutationOptions = {}
): DocumentMutationResult {
  if (document.nodes.some(({ id }) => id === node.id))
    return failure(document, "NODE_ID_DUPLICATED", `Node already exists: ${node.id}`, "/nodes");
  return complete(
    document,
    { ...document, nodes: [...document.nodes, node] },
    { ...createEmptyChangeSet(), addedNodeIds: [node.id] },
    "node-added",
    { nodeId: node.id },
    options
  );
}

export function updateNode(
  document: ScadaDocument,
  nodeId: string,
  update: (node: ScadaNode) => ScadaNode,
  options: MutationOptions = {}
): DocumentMutationResult {
  const current = document.nodes.find(({ id }) => id === nodeId);
  if (current === undefined)
    return failure(document, "NODE_ID_INVALID", `Node not found: ${nodeId}`, "/nodes");
  const nextNode = update(current);
  if (nextNode.id !== nodeId)
    return failure(document, "NODE_ID_INVALID", "A node update cannot change its ID.", "/nodes");
  return complete(
    document,
    {
      ...document,
      nodes: document.nodes.map((node) => (node.id === nodeId ? nextNode : node))
    },
    { ...createEmptyChangeSet(), updatedNodeIds: [nodeId] },
    "node-updated",
    { nodeId },
    options
  );
}

export function removeNode(
  document: ScadaDocument,
  nodeId: string,
  options: MutationOptions = {}
): DocumentMutationResult {
  const removed = document.nodes.find(({ id }) => id === nodeId);
  if (removed === undefined)
    return failure(document, "NODE_ID_INVALID", `Node not found: ${nodeId}`, "/nodes");
  const removedConnectionIds = document.connections
    .filter(({ source, target }) => source.nodeId === nodeId || target.nodeId === nodeId)
    .map(({ id }) => id);
  const removedBindingIds = document.bindings
    .filter(
      ({ target }) =>
        ("nodeId" in target && target.nodeId === nodeId) ||
        (target.type === "visibility" && target.entityId === nodeId)
    )
    .map(({ id }) => id);
  const nodes = document.nodes
    .filter(({ id }) => id !== nodeId)
    .map((node) => {
      const bindings = node.bindings.filter((id) => !removedBindingIds.includes(id));
      if (node.parentId !== nodeId)
        return bindings.length === node.bindings.length ? node : { ...node, bindings };
      const { parentId: removedParentId, ...withoutParent } = node;
      void removedParentId;
      const reparented = { ...withoutParent, bindings };
      return removed.parentId === undefined
        ? reparented
        : { ...reparented, parentId: removed.parentId };
    });
  return complete(
    document,
    {
      ...document,
      nodes,
      connections: document.connections.filter(({ id }) => !removedConnectionIds.includes(id)),
      bindings: document.bindings.filter(({ id }) => !removedBindingIds.includes(id))
    },
    {
      ...createEmptyChangeSet(),
      removedNodeIds: [nodeId],
      updatedNodeIds: nodes
        .filter((node) => document.nodes.find(({ id }) => id === node.id) !== node)
        .map(({ id }) => id),
      removedConnectionIds,
      removedBindingIds
    },
    "node-removed",
    { nodeId },
    options
  );
}

export function addConnection(
  document: ScadaDocument,
  connection: ScadaConnection,
  options: MutationOptions = {}
): DocumentMutationResult {
  if (document.connections.some(({ id }) => id === connection.id))
    return failure(
      document,
      "CONNECTION_ID_DUPLICATED",
      `Connection already exists: ${connection.id}`,
      "/connections"
    );
  return complete(
    document,
    { ...document, connections: [...document.connections, connection] },
    { ...createEmptyChangeSet(), addedConnectionIds: [connection.id] },
    "connection-added",
    { connectionId: connection.id },
    options
  );
}

export function updateConnection(
  document: ScadaDocument,
  connectionId: string,
  update: (connection: ScadaConnection) => ScadaConnection,
  options: MutationOptions = {}
): DocumentMutationResult {
  const current = document.connections.find(({ id }) => id === connectionId);
  if (current === undefined)
    return failure(
      document,
      "CONNECTION_ID_DUPLICATED",
      `Connection not found: ${connectionId}`,
      "/connections"
    );
  const next = update(current);
  if (next.id !== connectionId)
    return failure(
      document,
      "CONNECTION_ID_DUPLICATED",
      "A connection update cannot change its ID.",
      "/connections"
    );
  return complete(
    document,
    {
      ...document,
      connections: document.connections.map((connection) =>
        connection.id === connectionId ? next : connection
      )
    },
    { ...createEmptyChangeSet(), updatedConnectionIds: [connectionId] },
    "connection-updated",
    { connectionId },
    options
  );
}

export function removeConnection(
  document: ScadaDocument,
  connectionId: string,
  options: MutationOptions = {}
): DocumentMutationResult {
  if (!document.connections.some(({ id }) => id === connectionId))
    return failure(
      document,
      "CONNECTION_ID_DUPLICATED",
      `Connection not found: ${connectionId}`,
      "/connections"
    );
  return complete(
    document,
    {
      ...document,
      connections: document.connections.filter(({ id }) => id !== connectionId)
    },
    { ...createEmptyChangeSet(), removedConnectionIds: [connectionId] },
    "connection-removed",
    { connectionId },
    options
  );
}

export function addLayer(
  document: ScadaDocument,
  layer: ScadaLayer,
  options: MutationOptions = {}
): DocumentMutationResult {
  if (document.layers.some(({ id }) => id === layer.id))
    return failure(document, "LAYER_ID_DUPLICATED", `Layer already exists: ${layer.id}`, "/layers");
  return complete(
    document,
    { ...document, layers: [...document.layers, layer] },
    { ...createEmptyChangeSet(), addedLayerIds: [layer.id] },
    "layer-added",
    { layerId: layer.id },
    options
  );
}

export function updateLayer(
  document: ScadaDocument,
  layerId: string,
  update: (layer: ScadaLayer) => ScadaLayer,
  options: MutationOptions = {}
): DocumentMutationResult {
  const current = document.layers.find(({ id }) => id === layerId);
  if (current === undefined)
    return failure(document, "LAYER_NOT_FOUND", `Layer not found: ${layerId}`, "/layers");
  const next = update(current);
  if (next.id !== layerId)
    return failure(document, "LAYER_NOT_FOUND", "A layer update cannot change its ID.", "/layers");
  return complete(
    document,
    {
      ...document,
      layers: document.layers.map((layer) => (layer.id === layerId ? next : layer))
    },
    { ...createEmptyChangeSet(), updatedLayerIds: [layerId] },
    "layer-updated",
    { layerId },
    options
  );
}

export function removeLayer(
  document: ScadaDocument,
  layerId: string,
  targetLayerId?: string,
  options: MutationOptions = {}
): DocumentMutationResult {
  if (!document.layers.some(({ id }) => id === layerId))
    return failure(document, "LAYER_NOT_FOUND", `Layer not found: ${layerId}`, "/layers");
  if (document.layers.length === 1)
    return failure(document, "LAYER_NOT_FOUND", "The final layer cannot be removed.", "/layers");
  const nonEmpty =
    document.nodes.some(({ layerId: id }) => id === layerId) ||
    document.connections.some(({ layerId: id }) => id === layerId);
  if (nonEmpty && (targetLayerId === undefined || targetLayerId === layerId))
    return failure(
      document,
      "LAYER_NOT_FOUND",
      "A target layer is required when removing a non-empty layer.",
      "/layers"
    );
  if (targetLayerId !== undefined && !document.layers.some(({ id }) => id === targetLayerId))
    return failure(
      document,
      "LAYER_NOT_FOUND",
      `Target layer not found: ${targetLayerId}`,
      "/layers"
    );
  return complete(
    document,
    {
      ...document,
      layers: document.layers.filter(({ id }) => id !== layerId),
      nodes:
        targetLayerId === undefined
          ? document.nodes
          : document.nodes.map((node) =>
              node.layerId === layerId ? { ...node, layerId: targetLayerId } : node
            ),
      connections:
        targetLayerId === undefined
          ? document.connections
          : document.connections.map((connection) =>
              connection.layerId === layerId
                ? { ...connection, layerId: targetLayerId }
                : connection
            )
    },
    {
      ...createEmptyChangeSet(),
      removedLayerIds: [layerId],
      updatedNodeIds: document.nodes
        .filter(({ layerId: id }) => id === layerId)
        .map(({ id }) => id),
      updatedConnectionIds: document.connections
        .filter(({ layerId: id }) => id === layerId)
        .map(({ id }) => id)
    },
    "layer-removed",
    { layerId },
    options
  );
}

export function reorderLayers(
  document: ScadaDocument,
  orderedLayerIds: readonly string[],
  options: MutationOptions = {}
): DocumentMutationResult {
  if (
    orderedLayerIds.length !== document.layers.length ||
    new Set(orderedLayerIds).size !== document.layers.length ||
    orderedLayerIds.some((id) => !document.layers.some((layer) => layer.id === id))
  )
    return failure(
      document,
      "LAYER_ORDER_INVALID",
      "Layer order must contain every layer exactly once.",
      "/layers"
    );
  const byId = new Map(document.layers.map((layer) => [layer.id, layer]));
  const layers = orderedLayerIds.map((id, order) => {
    const layer = byId.get(id);
    if (layer === undefined) throw new Error(`Layer disappeared during reorder: ${id}`);
    return { ...layer, order };
  });
  return complete(
    document,
    { ...document, layers },
    { ...createEmptyChangeSet(), updatedLayerIds: [...orderedLayerIds] },
    "layers-reordered",
    { layerIds: [...orderedLayerIds] },
    options
  );
}
