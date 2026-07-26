import type {
  PropertyBinding,
  ScadaConnection,
  ScadaDocument,
  ScadaLayer,
  ScadaNode,
  DocumentVariable
} from "./model.js";

export function findNodeById(document: ScadaDocument, id: string): ScadaNode | undefined {
  return document.nodes.find((node) => node.id === id);
}
export function findConnectionById(
  document: ScadaDocument,
  id: string
): ScadaConnection | undefined {
  return document.connections.find((connection) => connection.id === id);
}
export function findLayerById(document: ScadaDocument, id: string): ScadaLayer | undefined {
  return document.layers.find((layer) => layer.id === id);
}
export function findVariableById(
  document: ScadaDocument,
  id: string
): DocumentVariable | undefined {
  return document.variables.find((variable) => variable.id === id);
}
export function findBindingById(document: ScadaDocument, id: string): PropertyBinding | undefined {
  return document.bindings.find((binding) => binding.id === id);
}
export function getChildrenOfNode(document: ScadaDocument, nodeId: string): readonly ScadaNode[] {
  return document.nodes.filter(({ parentId }) => parentId === nodeId);
}
export function getConnectionsForNode(
  document: ScadaDocument,
  nodeId: string
): readonly ScadaConnection[] {
  return document.connections.filter(
    ({ source, target }) => source.nodeId === nodeId || target.nodeId === nodeId
  );
}
export function getConnectionsForPort(
  document: ScadaDocument,
  nodeId: string,
  portId: string
): readonly ScadaConnection[] {
  return document.connections.filter(
    ({ source, target }) =>
      (source.nodeId === nodeId && source.portId === portId) ||
      (target.nodeId === nodeId && target.portId === portId)
  );
}
export function getNodesInLayer(document: ScadaDocument, layerId: string): readonly ScadaNode[] {
  return document.nodes.filter((node) => node.layerId === layerId);
}
export function getConnectionsInLayer(
  document: ScadaDocument,
  layerId: string
): readonly ScadaConnection[] {
  return document.connections.filter((connection) => connection.layerId === layerId);
}
export function getRootNodes(document: ScadaDocument): readonly ScadaNode[] {
  return document.nodes.filter(({ parentId }) => parentId === undefined);
}
export function getVisibleLayers(document: ScadaDocument): readonly ScadaLayer[] {
  return document.layers.filter(({ visible }) => visible).sort((a, b) => a.order - b.order);
}

export class DocumentIndex {
  public readonly nodeById: ReadonlyMap<string, ScadaNode>;
  public readonly connectionById: ReadonlyMap<string, ScadaConnection>;
  public readonly layerById: ReadonlyMap<string, ScadaLayer>;
  public readonly variableById: ReadonlyMap<string, DocumentVariable>;
  public readonly bindingById: ReadonlyMap<string, PropertyBinding>;
  public readonly duplicateIds: ReadonlySet<string>;
  readonly #connectionsByNodeId = new Map<string, ScadaConnection[]>();

  public constructor(document: ScadaDocument) {
    const duplicates = new Set<string>();
    const createMap = <T extends { readonly id: string }>(items: readonly T[]): Map<string, T> => {
      const map = new Map<string, T>();
      for (const item of items) {
        if (map.has(item.id)) duplicates.add(item.id);
        else map.set(item.id, item);
      }
      return map;
    };
    this.nodeById = createMap(document.nodes);
    this.connectionById = createMap(document.connections);
    this.layerById = createMap(document.layers);
    this.variableById = createMap(document.variables);
    this.bindingById = createMap(document.bindings);
    this.duplicateIds = duplicates;
    for (const connection of document.connections) {
      for (const nodeId of new Set([connection.source.nodeId, connection.target.nodeId])) {
        const current = this.#connectionsByNodeId.get(nodeId) ?? [];
        current.push(connection);
        this.#connectionsByNodeId.set(nodeId, current);
      }
    }
  }

  public getConnectionsForNode(nodeId: string): readonly ScadaConnection[] {
    return [...(this.#connectionsByNodeId.get(nodeId) ?? [])];
  }
}
