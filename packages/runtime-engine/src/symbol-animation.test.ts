import { describe, expect, it } from "vitest";
import { ManualAnimationClock, ManualAnimationFrameDriver } from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import {
  InMemorySymbolRegistry,
  createBuiltInSymbolAnimationMetadata,
  type SymbolDefinition
} from "@web-scada/symbols";
import { RuntimeAnimationManager } from "./symbol-animation.js";

const animatedSymbol: SymbolDefinition = {
  type: "test.animated-motor",
  displayNameKey: "test.motor",
  category: "test",
  defaultWidth: 100,
  defaultHeight: 100,
  minimumWidth: 10,
  minimumHeight: 10,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal", "running"],
  animation: createBuiltInSymbolAnimationMetadata(["motion", "indicator"])
};

const documentWith = (count: number): ScadaDocument => ({
  schemaVersion: "1.0.0",
  id: "animation-document",
  metadata: {
    name: "Animation",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 1000,
    height: 1000,
    background: "#000000",
    gridSize: 10,
    gridVisible: true,
    snapToGrid: false,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
  nodes: Array.from({ length: count }, (_, index) => ({
    id: `motor-${String(index)}`,
    name: `Motor ${String(index)}`,
    symbolType: animatedSymbol.type,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
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

function fixture(): {
  readonly manager: RuntimeAnimationManager;
  readonly clock: ManualAnimationClock;
  readonly driver: ManualAnimationFrameDriver;
  readonly commits: unknown[];
} {
  const symbols = new InMemorySymbolRegistry();
  symbols.register(animatedSymbol);
  const clock = new ManualAnimationClock();
  const driver = new ManualAnimationFrameDriver();
  const commits: unknown[] = [];
  const manager = new RuntimeAnimationManager({
    symbols,
    timeSource: clock,
    frameDriver: driver,
    onSamples: (_entityId, samples) => commits.push(samples)
  });
  return { manager, clock, driver, commits };
}

describe("RuntimeAnimationManager", () => {
  it("drives symbol slots through one scheduler and composes transient samples", () => {
    const { manager, clock, driver, commits } = fixture();
    manager.loadDocument(documentWith(1));
    manager.controller("motor-0")?.play("motion");
    expect(manager.scheduler.getSnapshot().activeTaskIds).toHaveLength(1);
    driver.fireFrame(0);
    clock.set(500);
    driver.fireFrame(500);
    expect(commits.at(-1)).toMatchObject([
      { entityId: "motor-0", slotId: "motion", channel: "rotation", value: 180 }
    ]);
    expect(manager.valueStoreSize).toBe(1);
    manager.dispose();
    expect(manager.valueStoreSize).toBe(0);
    expect(manager.scheduler.state).toBe("disposed");
  });

  it("applies enabled, speed, duration and target-value bindings with diagnostics isolation", () => {
    const { manager, driver } = fixture();
    manager.loadDocument(documentWith(1));
    manager.applyBinding({
      entityId: "motor-0",
      slotId: "motion",
      parameter: "enabled",
      value: true
    });
    manager.applyBinding({ entityId: "motor-0", parameter: "speed", value: 2 });
    manager.applyBinding({
      entityId: "motor-0",
      slotId: "motion",
      parameter: "duration",
      value: 50
    });
    driver.fireFrame(0);
    manager.applyBinding({ entityId: "motor-0", parameter: "speed", value: -1 });
    expect(manager.diagnostics.at(-1)?.code).toBe("ANIMATION_BINDING_INVALID");
    manager.applyBinding({ entityId: "missing", parameter: "enabled", value: true });
    expect(manager.diagnostics.at(-1)?.code).toBe("ANIMATION_SYMBOL_NOT_FOUND");
    manager.dispose();
  });

  it("pauses for document visibility, applies reduced motion and cleans removed entities", () => {
    const { manager, driver } = fixture();
    manager.loadDocument(documentWith(2));
    manager.controller("motor-0")?.play("motion");
    manager.setVisibility("document-hidden");
    expect(driver.pendingCount).toBe(0);
    manager.setVisibility("visible");
    expect(driver.pendingCount).toBe(1);
    manager.setEntityVisibility("motor-0", "offscreen");
    expect(manager.controller("motor-0")?.activeSlotIds).toEqual(["motion"]);
    manager.setEntityVisibility("motor-0", "visible");
    manager.setReducedMotion("reduce");
    manager.loadDocument(documentWith(1));
    expect(manager.controller("motor-1")).toBeUndefined();
    manager.dispose();
  });

  it("maps legacy phase10 animation targets without changing persisted nodes", () => {
    const { animation: _animation, ...legacyBase } = animatedSymbol;
    expect(_animation).toBeDefined();
    const legacy = {
      ...legacyBase,
      type: "test.legacy",
      phase10Capabilities: { animationTargets: ["rotor"] }
    } satisfies SymbolDefinition;
    const symbols = new InMemorySymbolRegistry();
    symbols.register(legacy);
    const document = documentWith(1);
    const legacyDocument = {
      ...document,
      nodes: document.nodes.map((node) => ({ ...node, symbolType: legacy.type }))
    };
    const before = JSON.stringify(legacyDocument);
    const manager = new RuntimeAnimationManager({
      symbols,
      frameDriver: new ManualAnimationFrameDriver()
    });
    manager.loadDocument(legacyDocument);
    expect(manager.controller("motor-0")?.slotIds).toContain("motion");
    expect(JSON.stringify(legacyDocument)).toBe(before);
    manager.dispose();
  });

  it("replaces and disposes a controller when a node changes symbol type", () => {
    const { manager } = fixture();
    const document = documentWith(1);
    manager.loadDocument(document);
    const original = manager.controller("motor-0");
    manager.loadDocument({
      ...document,
      nodes: document.nodes.map((node) => ({ ...node, symbolType: "unknown.static" }))
    });
    expect(manager.controller("motor-0")).toBeUndefined();
    expect(() => original?.play("motion")).toThrow(/disposed/);
    manager.dispose();
  });
});
