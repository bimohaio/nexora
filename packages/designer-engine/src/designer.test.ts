import type { ScadaDocument, ScadaNode } from "@web-scada/core";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";
import { describe, expect, it, vi } from "vitest";

import {
  DesignerToolController,
  InMemoryToolRegistry,
  MoveNodesCommand,
  SelectTool,
  createDesignerEngine,
  handleDesignerShortcut,
  resizeTransform,
  type DesignerPointerEvent
} from "./index.js";

function node(id: string, x: number, y: number): ScadaNode {
  return {
    id,
    name: id,
    symbolType: "process.vertical-tank",
    transform: { x, y, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId: "layer",
    visible: true,
    locked: false
  };
}

function document(): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "doc_designer",
    metadata: {
      name: "Designer test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 1000,
      height: 800,
      background: "#fff",
      gridSize: 10,
      gridVisible: true,
      snapToGrid: true,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "layer", name: "Layer", order: 0, visible: true, locked: false }],
    nodes: [node("node_a", 10, 10), node("node_b", 250, 20)],
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

const pointer = (x: number, y: number, nodeId?: string): DesignerPointerEvent => ({
  point: { x, y },
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  entityType: nodeId === undefined ? undefined : "node",
  nodeId
});

describe("NativeDesignerEngine", () => {
  it("honors configured history retention at the Designer boundary", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry(),
      history: { maxEntries: 1 }
    });
    designer.selectNode("node_a");
    designer.moveSelection({ x: 10, y: 0 });
    designer.resizeNode("node_a", "se", { x: 10, y: 0 });
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform).toMatchObject({ x: 20, width: 100 });
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform).toMatchObject({ x: 20, width: 100 });
  });

  it("supports deterministic selection, marquee, snapped moves, resize, undo, and redo", () => {
    const renderChanges = vi.fn();
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry(),
      renderer: {
        renderDocument: vi.fn(),
        renderChanges,
        setViewport: vi.fn()
      }
    });

    designer.selectNode("node_a");
    designer.selectNode("node_b", "add");
    expect(designer.getState().selection.selectedNodeIds).toEqual(["node_a", "node_b"]);
    designer.selectMarquee({ x: 0, y: 0, width: 120, height: 120 });
    expect(designer.getState().selection.selectedNodeIds).toEqual(["node_a"]);

    designer.moveSelection({ x: 13, y: 7 });
    expect(designer.getState().document.nodes[0]?.transform).toMatchObject({ x: 20, y: 20 });
    designer.resizeNode("node_a", "se", { x: -500, y: -500 });
    expect(designer.getState().document.nodes[0]?.transform).toMatchObject({
      width: 33,
      height: 54
    });
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform.width).toBe(100);
    expect(renderChanges).toHaveBeenLastCalledWith(
      designer.getState().document,
      expect.objectContaining({ updatedNodeIds: ["node_a"] })
    );
    designer.redo();
    expect(designer.getState().document.nodes[0]?.transform.width).toBe(33);
    expect(renderChanges).toHaveBeenLastCalledWith(
      designer.getState().document,
      expect.objectContaining({ updatedNodeIds: ["node_a"] })
    );
  });

  it("copies, pastes, duplicates, cuts, and gives pasted nodes fresh IDs", async () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_a");
    await designer.copy();
    await designer.paste();
    expect(designer.getState().document.nodes).toHaveLength(3);
    expect(new Set(designer.getState().document.nodes.map(({ id }) => id)).size).toBe(3);
    await designer.duplicate();
    expect(designer.getState().document.nodes).toHaveLength(4);
    await designer.cut();
    expect(designer.getState().document.nodes).toHaveLength(3);
    designer.undo();
    expect(designer.getState().document.nodes).toHaveLength(4);
  });

  it("commits multiple real commands as one atomic history operation", () => {
    const renderChanges = vi.fn();
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry(),
      renderer: { renderDocument: vi.fn(), renderChanges, setViewport: vi.fn() }
    });
    designer.executeTransaction(
      [
        new MoveNodesCommand(["node_a"], { x: 10, y: 0 }),
        new MoveNodesCommand(["node_b"], { x: 0, y: 20 })
      ],
      { label: "Move two nodes" }
    );
    expect(designer.getState().document.nodes.map(({ transform }) => transform)).toMatchObject([
      { x: 20, y: 10 },
      { x: 250, y: 40 }
    ]);
    expect(renderChanges).toHaveBeenCalledTimes(1);

    designer.undo();
    expect(designer.getState().document.nodes.map(({ transform }) => transform)).toMatchObject([
      { x: 10, y: 10 },
      { x: 250, y: 20 }
    ]);
    expect(designer.getRuntimeState()).toMatchObject({ canUndo: false, canRedo: true });

    designer.redo();
    expect(designer.getState().document.nodes.map(({ transform }) => transform)).toMatchObject([
      { x: 20, y: 10 },
      { x: 250, y: 40 }
    ]);
  });

  it("merges repeated moves and resizes while preserving logical undo and redo", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_a");
    designer.nudgeSelection({ x: 1, y: 0 });
    designer.nudgeSelection({ x: 2, y: 0 });
    designer.nudgeSelection({ x: 3, y: 0 });
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(16);
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(10);
    expect(designer.getRuntimeState()).toMatchObject({ canUndo: false, canRedo: true });
    designer.redo();
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(16);

    designer.resizeNode("node_a", "se", { x: 10, y: 10 });
    designer.resizeNode("node_a", "se", { x: 20, y: 20 });
    expect(designer.getState().document.nodes[0]?.transform.width).toBe(130);
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform.width).toBe(100);
    designer.redo();
    expect(designer.getState().document.nodes[0]?.transform.width).toBe(130);
  });

  it("does not merge movement when the selected target set changes", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_a");
    designer.nudgeSelection({ x: 1, y: 0 });
    designer.selectNode("node_b");
    designer.nudgeSelection({ x: 1, y: 0 });
    designer.undo();
    expect(designer.getState().document.nodes[1]?.transform.x).toBe(250);
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(11);
    designer.undo();
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(10);
  });

  it("merges movement only while an identical multi-selection remains adjacent", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_a");
    designer.selectNode("node_b", "add");
    designer.nudgeSelection({ x: 1, y: 1 });
    designer.nudgeSelection({ x: 2, y: 2 });
    designer.undo();
    expect(designer.getState().document.nodes.map(({ transform }) => transform)).toMatchObject([
      { x: 10, y: 10 },
      { x: 250, y: 20 }
    ]);
    expect(designer.getRuntimeState().canUndo).toBe(false);
  });

  it("updates viewport and centers a selection", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.setViewport({ x: -100, y: -100, zoom: 2 });
    expect(designer.getState().viewport.zoom).toBe(2);
    designer.setViewport({ x: -40, y: -30, zoom: 2 });
    expect(designer.getState().viewport).toMatchObject({ x: -40, y: -30 });
    designer.selectNode("node_a");
    designer.centerSelection({ width: 500, height: 400 });
    expect(designer.getState().viewport.zoom).toBeGreaterThan(0);
  });
});

describe("designer tools and shortcuts", () => {
  it("nudges a selected node independently of grid snapping", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    designer.selectNode("node_a");

    handleDesignerShortcut(designer, {
      key: "ArrowRight",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    });
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(11);

    handleDesignerShortcut(designer, {
      key: "ArrowDown",
      ctrlKey: false,
      metaKey: false,
      shiftKey: true
    });
    expect(designer.getState().document.nodes[0]?.transform).toMatchObject({ x: 11, y: 20 });
  });

  it("routes tool lifecycle and commits drag and rectangle interactions", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    const registry = new InMemoryToolRegistry();
    registry.register(new SelectTool(designer));
    const controller = new DesignerToolController(designer, registry);
    controller.activate("select");
    controller.pointerDown(pointer(10, 10, "node_a"));
    controller.pointerMove(pointer(30, 30, "node_a"));
    controller.pointerUp(pointer(30, 30, "node_a"));
    expect(designer.getState().document.nodes[0]?.transform.x).toBe(30);
    handleDesignerShortcut(designer, {
      key: "a",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false
    });
    expect(designer.getState().selection.selectedNodeIds).toHaveLength(2);
    controller.dispose();
  });

  it("selects the owning symbol when its visible port receives the pointer", () => {
    const designer = createDesignerEngine({
      document: document(),
      symbols: createIndustrialSymbolRegistry()
    });
    const tool = new SelectTool(designer);
    tool.pointerDown({ ...pointer(10, 10, "node_a"), entityType: "port", portId: "outlet" });
    tool.pointerUp(pointer(10, 10, "node_a"));
    expect(designer.getState().selection.selectedNodeIds).toEqual(["node_a"]);
  });

  it("enforces minimum dimensions for every resize direction", () => {
    expect(
      resizeTransform(node("node_a", 0, 0), "nw", { x: 200, y: 200 }, { width: 20, height: 30 })
    ).toMatchObject({ x: 80, y: 70, width: 20, height: 30 });
  });
});
