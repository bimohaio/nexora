import {
  FocusEngine,
  KeyboardEngine,
  NavigationEngine,
  type FocusTarget,
  type KeyboardDiagnostics,
  type KeyboardRenderAdapter,
  type KeyMap
} from "@web-scada/interaction-engine";
import type { DesignerController } from "./contracts.js";

export interface DesignerKeyboardEngineOptions {
  readonly designer: DesignerController;
  readonly renderer?: KeyboardRenderAdapter;
  readonly diagnostics?: KeyboardDiagnostics;
  readonly keyMap?: KeyMap;
  readonly readOnly?: boolean;
}

export function designerFocusTargets(designer: DesignerController): readonly FocusTarget[] {
  const { document } = designer.getState();
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  const layerTargets: FocusTarget[] = document.layers.map((layer) => ({
    id: layer.id,
    kind: "layer",
    order: layer.order,
    hidden: !layer.visible,
    locked: layer.locked
  }));
  const nodes: FocusTarget[] = document.nodes.map((node, index) => ({
    id: node.id,
    kind: "node",
    parentId: node.parentId ?? node.layerId,
    order: (layers.get(node.layerId)?.order ?? 0) * 1_000_000 + index,
    hidden: !node.visible || layers.get(node.layerId)?.visible === false,
    locked: node.locked || layers.get(node.layerId)?.locked === true,
    layerId: node.layerId
  }));
  const connections: FocusTarget[] = document.connections.map((connection, index) => ({
    id: connection.id,
    kind: "connection",
    parentId: connection.layerId,
    order: (layers.get(connection.layerId)?.order ?? 0) * 1_000_000 + nodes.length + index,
    hidden: !connection.visible || layers.get(connection.layerId)?.visible === false,
    locked: connection.locked || layers.get(connection.layerId)?.locked === true,
    layerId: connection.layerId
  }));
  return Object.freeze([
    { id: document.id, kind: "canvas", order: -1 },
    ...layerTargets,
    ...nodes,
    ...connections
  ]);
}

export function createDesignerKeyboardEngine(
  options: DesignerKeyboardEngineOptions
): KeyboardEngine {
  const focus = new FocusEngine({
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics })
  });
  const navigation = new NavigationEngine(focus, {
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics })
  });
  const engine = new KeyboardEngine({
    focus,
    navigation,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.renderer === undefined ? {} : { renderer: options.renderer }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
    onFocusChanged: (target) => {
      if (target?.kind === "node") options.designer.selectNode(target.id, "replace");
      else if (target?.kind === "connection")
        options.designer.selectConnection(target.id, "replace");
      else if (target === undefined) options.designer.clearSelection();
    },
    onToggleSelection: (target) => {
      if (target.kind === "node") options.designer.selectNode(target.id, "toggle");
      else if (target.kind === "connection") options.designer.selectConnection(target.id, "toggle");
    },
    onEscape: () => {
      options.designer.setInteraction({ type: "idle" });
      options.designer.clearSelection();
    }
  });
  engine.setTargets(designerFocusTargets(options.designer));
  return engine;
}
