import type { ScadaDocument } from "@web-scada/core";
import { SelectionManager } from "@web-scada/interaction-engine";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";
import { describe, expect, it } from "vitest";
import {
  DesignerDocumentSelectionPolicy,
  DesignerSelectionBridge,
  createDesignerEngine
} from "./index.js";

function document(): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "doc_selection",
    metadata: {
      name: "Selection",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 100,
      height: 100,
      background: "#fff",
      gridSize: 10,
      gridVisible: true,
      snapToGrid: true,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "layer", name: "Layer", order: 0, visible: true, locked: false }],
    nodes: [
      {
        id: "node_a",
        name: "A",
        symbolType: "process.vertical-tank",
        transform: {
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1
        },
        properties: {},
        bindings: [],
        layerId: "layer",
        visible: true,
        locked: false
      }
    ],
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

describe("DesignerSelectionBridge", () => {
  it("maps renderer-independent selection into existing designer state", () => {
    const source = document();
    const designer = createDesignerEngine({
      document: source,
      symbols: createIndustrialSymbolRegistry()
    });
    const selection = new SelectionManager({
      policies: [new DesignerDocumentSelectionPolicy(source)]
    });
    const bridge = new DesignerSelectionBridge(designer, selection);
    selection.select({ id: "node_a", kind: "node" });
    expect(designer.getState().selection.selectedNodeIds).toEqual(["node_a"]);
    designer.clearSelection();
    bridge.syncFromDesigner();
    expect(selection.isEmpty).toBe(true);
    bridge.dispose();
  });
});
