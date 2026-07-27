import type { ScadaConnection } from "@web-scada/core";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";
import { describe, expect, it, vi } from "vitest";

import {
  DesignerInteractionSession,
  createDesignerEngine,
  documentSnapTolerance,
  rankSnapCandidates
} from "./index.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

describe("Phase 5 advanced editing", () => {
  it("rotates, aligns, distributes, and resizes a multi-selection atomically", () => {
    const designer = createDesignerEngine({
      document: createDesignerTestDocument(3),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectAll();
    designer.rotateSelection(15);
    expect(designer.getState().document.nodes.map(({ transform }) => transform.rotation)).toEqual([
      15, 15, 15
    ]);
    designer.alignSelection("top");
    expect(
      new Set(
        designer
          .getState()
          .document.nodes.map(({ transform }) => Math.round(transform.y - transform.width / 2))
      ).size
    ).toBe(1);
    designer.distributeSelection("horizontal");
    designer.resizeSelection("se", { x: 100, y: 50 });
    expect(designer.getRuntimeState().canUndo).toBe(true);
    designer.undo();
    designer.undo();
    designer.undo();
    designer.undo();
    expect(designer.getState().document).toEqual(createDesignerTestDocument(3));
  });

  it("groups, moves, copies, pastes, and ungroups with parent IDs remapped", async () => {
    const designer = createDesignerEngine({
      document: createDesignerTestDocument(3),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.setSelection({
      selectedNodeIds: ["node_0", "node_1"],
      selectedConnectionIds: []
    });
    designer.groupSelection();
    expect(designer.getState().document.nodes[1]?.parentId).toBe("node_0");
    designer.moveSelection({ x: 20, y: 0 });
    expect(
      designer
        .getState()
        .document.nodes.slice(0, 2)
        .map(({ transform }) => transform.x)
    ).toEqual([20, 170]);
    await designer.duplicate();
    const pasted = designer
      .getState()
      .document.nodes.filter(({ id }) => !["node_0", "node_1", "node_2"].includes(id));
    expect(pasted).toHaveLength(2);
    expect(pasted[1]?.parentId).toBe(pasted[0]?.id);
    designer.undo();
    designer.selectNode("node_0");
    designer.ungroupSelection();
    expect(designer.getState().document.nodes[1]?.parentId).toBeUndefined();
  });

  it("enforces lock, visibility, ordering, and layer reassignment policies", () => {
    const document = {
      ...createDesignerTestDocument(2),
      layers: [
        ...createDesignerTestDocument(2).layers,
        { id: "layer_2", name: "Layer 2", order: 1, visible: true, locked: false }
      ]
    };
    const designer = createDesignerEngine({
      document,
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_0");
    designer.setSelectionLocked(true);
    designer.moveSelection({ x: 50, y: 0 });
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(0);
    designer.setSelectionLocked(false);
    designer.reassignSelectionToLayer("layer_2");
    expect(designer.getState().document.nodes[0]?.layerId).toBe("layer_2");
    designer.setSelectionVisible(false);
    expect(designer.getState().document.nodes[0]?.visible).toBe(false);
    expect(designer.getState().selection.selectedNodeIds).toEqual([]);
  });

  it("inserts, moves, removes waypoints and rejects invalid endpoint reassignment", () => {
    const base = createDesignerTestDocument(2);
    const connection: ScadaConnection = {
      id: "connection_0",
      name: "Connection",
      source: { nodeId: "node_0", portId: "outlet" },
      target: { nodeId: "node_1", portId: "inlet" },
      routing: "direct",
      waypoints: [],
      medium: "water",
      direction: "forward",
      style: {},
      layerId: "layer",
      visible: true,
      locked: false
    };
    const designer = createDesignerEngine({
      document: { ...base, connections: [connection] },
      symbols: createIndustrialSymbolRegistry()
    });
    designer.insertWaypoint("connection_0", { x: 100, y: 80 });
    expect(designer.getState().document.connections[0]?.waypoints).toHaveLength(1);
    designer.moveWaypoint("connection_0", 0, { x: 110, y: 90 });
    expect(designer.getState().document.connections[0]?.waypoints[0]).toEqual({ x: 110, y: 90 });
    designer.reconnectEndpoint("connection_0", "target", "missing", "inlet");
    expect(designer.getState().document.connections[0]?.target.nodeId).toBe("node_1");
    designer.removeWaypoint("connection_0", 0);
    expect(designer.getState().document.connections[0]?.waypoints).toEqual([]);
    designer.undo();
    expect(designer.getState().document.connections[0]?.waypoints).toEqual([{ x: 110, y: 90 }]);
  });

  it("supports cancelable, idempotently disposable interaction sessions", () => {
    const cancel = vi.fn();
    const dispose = vi.fn();
    const session = new DesignerInteractionSession({
      id: "session_1",
      kind: "rotate",
      update: ({ angle }: { readonly angle: number }) => angle,
      commit: () => 15,
      cancel,
      dispose
    });
    expect(session.update({ angle: 12 })).toBe(12);
    session.cancel("escape");
    session.cancel("again");
    session.dispose();
    session.dispose();
    expect(cancel).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(session.status).toBe("disposed");
  });

  it("ranks snap candidates by explicit deterministic policy and converts screen tolerance", () => {
    const ranked = rankSnapCandidates([
      { type: "grid", rawValue: 9, snappedValue: 10, distance: 1 },
      { type: "alignment", rawValue: 9, snappedValue: 10, distance: 1 },
      { type: "guide", rawValue: 9, snappedValue: 10, distance: 2 }
    ]);
    expect(ranked.map(({ type }) => type)).toEqual(["guide", "alignment", "grid"]);
    expect(documentSnapTolerance(6, 2)).toBe(3);
  });
});
