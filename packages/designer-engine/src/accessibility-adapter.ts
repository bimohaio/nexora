import {
  AccessibilityEngine,
  AccessibilityFocusManager,
  FocusEngine,
  computeAccessibleName,
  type AccessibilityDiagnostics,
  type AccessibilityNode,
  type AccessibilityPreferences,
  type AccessibilityRendererAdapter,
  type ScreenReaderAdapter
} from "@web-scada/interaction-engine";
import type { DesignerController } from "./contracts.js";

export function designerAccessibilityNodes(
  designer: DesignerController
): readonly AccessibilityNode[] {
  const { document, selection } = designer.getState();
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  const root: AccessibilityNode = {
    id: document.id,
    children: document.layers.map(({ id }) => id),
    role: "graphics-document",
    label: computeAccessibleName({
      explicitLabel: document.metadata.name,
      fallbackName: "SCADA document",
      id: document.id
    }),
    ...(document.metadata.description === undefined
      ? {}
      : { description: document.metadata.description }),
    state: {},
    properties: { targetKind: "canvas" },
    visible: true,
    focusable: true
  };
  const layerNodes: AccessibilityNode[] = document.layers.map((layer) => ({
    id: layer.id,
    parent: document.id,
    children: [
      ...document.nodes.filter(({ layerId }) => layerId === layer.id).map(({ id }) => id),
      ...document.connections.filter(({ layerId }) => layerId === layer.id).map(({ id }) => id)
    ],
    role: "group",
    label: layer.name,
    description: `Layer ${String(layer.order + 1)}`,
    state: { disabled: layer.locked, locked: layer.locked },
    properties: { targetKind: "layer", order: layer.order },
    visible: layer.visible,
    focusable: !layer.locked
  }));
  const nodes: AccessibilityNode[] = document.nodes.map((node) => ({
    id: node.id,
    parent: node.layerId,
    children: [],
    role: "graphics-symbol",
    label: computeAccessibleName({
      explicitLabel: node.name,
      ...(node.metadata === undefined ? {} : { symbolMetadata: node.metadata }),
      propertyMetadata: node.properties,
      fallbackName: node.symbolType,
      id: node.id
    }),
    description: node.symbolType,
    state: {
      selected: selection.selectedNodeIds.includes(node.id),
      disabled: node.locked,
      locked: node.locked
    },
    properties: { targetKind: "node", symbolType: node.symbolType },
    visible: node.visible && layers.get(node.layerId)?.visible !== false,
    focusable: !node.locked
  }));
  const connections: AccessibilityNode[] = document.connections.map((connection) => ({
    id: connection.id,
    parent: connection.layerId,
    children: [],
    role: "graphics-object",
    label: computeAccessibleName({
      explicitLabel: connection.name,
      ...(connection.metadata === undefined ? {} : { pluginMetadata: connection.metadata }),
      fallbackName: `${connection.source.nodeId} to ${connection.target.nodeId}`,
      id: connection.id
    }),
    description: `${connection.medium} connection`,
    state: {
      selected: selection.selectedConnectionIds.includes(connection.id),
      disabled: connection.locked,
      locked: connection.locked
    },
    properties: { targetKind: "connection", medium: connection.medium },
    visible: connection.visible && layers.get(connection.layerId)?.visible !== false,
    focusable: !connection.locked
  }));
  return Object.freeze([root, ...layerNodes, ...nodes, ...connections]);
}

export interface DesignerAccessibilityEngineOptions {
  readonly designer: DesignerController;
  readonly screenReader: ScreenReaderAdapter;
  readonly renderer?: AccessibilityRendererAdapter;
  readonly diagnostics?: AccessibilityDiagnostics;
  readonly preferences?: Partial<AccessibilityPreferences>;
  readonly readOnly?: boolean;
}

export function createDesignerAccessibilityEngine(
  options: DesignerAccessibilityEngineOptions
): AccessibilityEngine {
  const focus = new FocusEngine({
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly })
  });
  const engine = new AccessibilityEngine({
    focus: new AccessibilityFocusManager(focus),
    screenReader: options.screenReader,
    ...(options.renderer === undefined ? {} : { renderer: options.renderer }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
    ...(options.preferences === undefined ? {} : { preferences: options.preferences }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly })
  });
  engine.update(designerAccessibilityNodes(options.designer));
  return engine;
}
