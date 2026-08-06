import { describe, expect, it } from "vitest";
import { ManualAnimationClock, ManualAnimationFrameDriver } from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import {
  InMemorySymbolRegistry,
  createBuiltInSymbolAnimationMetadata,
  type SymbolDefinition
} from "@web-scada/symbols";
import { RuntimeAnimationManager } from "./symbol-animation.js";

const stressSymbol: SymbolDefinition = {
  type: "benchmark.animated",
  displayNameKey: "benchmark",
  category: "equipment",
  defaultWidth: 10,
  defaultHeight: 10,
  minimumWidth: 1,
  minimumHeight: 1,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal"],
  animation: createBuiltInSymbolAnimationMetadata(["motion", "flow", "level", "indicator", "valve"])
};

const documentWithNodes = (count: number, symbolType: string): ScadaDocument => ({
  schemaVersion: "1.0.0",
  id: "stress",
  metadata: {
    name: "Stress",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 1000,
    height: 1000,
    background: "#000",
    gridSize: 10,
    gridVisible: false,
    snapToGrid: false,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
  nodes: Array.from({ length: count }, (_, index) => ({
    id: `node-${String(index)}`,
    name: "Node",
    symbolType,
    transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId: "main",
    visible: true,
    locked: false
  })),
  connections: [],
  variables: [],
  bindings: [],
  runtimeSettings: { refreshInterval: 100, defaultQuality: "unknown" }
});

describe("symbol animation 1000 symbols / 5000 slots", () => {
  it("samples one shared-scheduler frame", () => {
    const symbols = new InMemorySymbolRegistry();
    symbols.register(stressSymbol);
    const clock = new ManualAnimationClock();
    const driver = new ManualAnimationFrameDriver();
    const manager = new RuntimeAnimationManager({
      symbols,
      timeSource: clock,
      frameDriver: driver
    });
    const document = documentWithNodes(1000, stressSymbol.type);
    manager.loadDocument(document);
    for (const node of document.nodes)
      for (const slot of stressSymbol.animation?.slots ?? []) manager.play(node.id, slot.id);
    expect(manager.scheduler.getSnapshot().activeTaskIds).toHaveLength(5000);
    driver.fireFrame(0);
    clock.set(16);
    driver.fireFrame(16);
    expect(manager.scheduler.getSnapshot().statistics.totalCallbackInvocations).toBe(10_000);
    expect(driver.pendingCount).toBe(1);
    manager.dispose();
  });
});
