import { createEmptyChangeSet, type DocumentChangeSet, type ScadaDocument } from "@web-scada/core";

function classify<T extends { readonly id: string }>(
  previous: readonly T[],
  next: readonly T[]
): {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
} {
  const previousById = new Map(previous.map((entity) => [entity.id, entity]));
  const nextById = new Map(next.map((entity) => [entity.id, entity]));
  return {
    added: next.filter(({ id }) => !previousById.has(id)).map(({ id }) => id),
    updated: next
      .filter(({ id }) => previousById.has(id) && previousById.get(id) !== nextById.get(id))
      .map(({ id }) => id),
    removed: previous.filter(({ id }) => !nextById.has(id)).map(({ id }) => id)
  };
}

export function deriveDocumentChangeSet(
  previous: Readonly<ScadaDocument>,
  next: Readonly<ScadaDocument>
): DocumentChangeSet {
  const nodes = classify(previous.nodes, next.nodes);
  const connections = classify(previous.connections, next.connections);
  const layers = classify(previous.layers, next.layers);
  const variables = classify(previous.variables, next.variables);
  const bindings = classify(previous.bindings, next.bindings);
  return {
    ...createEmptyChangeSet(),
    addedNodeIds: nodes.added,
    updatedNodeIds: nodes.updated,
    removedNodeIds: nodes.removed,
    addedConnectionIds: connections.added,
    updatedConnectionIds: connections.updated,
    removedConnectionIds: connections.removed,
    addedLayerIds: layers.added,
    updatedLayerIds: layers.updated,
    removedLayerIds: layers.removed,
    addedVariableIds: variables.added,
    updatedVariableIds: variables.updated,
    removedVariableIds: variables.removed,
    addedBindingIds: bindings.added,
    updatedBindingIds: bindings.updated,
    removedBindingIds: bindings.removed,
    canvasChanged: previous.canvas !== next.canvas,
    metadataChanged: previous.metadata !== next.metadata,
    runtimeSettingsChanged: previous.runtimeSettings !== next.runtimeSettings
  };
}
