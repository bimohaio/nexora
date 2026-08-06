/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- cross-package integration exercises built artifacts */
// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { ManualAnimationClock, ManualAnimationFrameDriver } from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import { SvgSymbolAnimationAdapter } from "@web-scada/renderer-svg";
import { RuntimeAnimationManager } from "@web-scada/runtime-engine";
import {
  InMemorySymbolRegistry,
  createBuiltInSymbolAnimationMetadata,
  type SymbolDefinition
} from "@web-scada/symbols";

const motor: SymbolDefinition = {
  type: "integration.motor",
  displayNameKey: "motor",
  category: "motor",
  defaultWidth: 100,
  defaultHeight: 100,
  minimumWidth: 10,
  minimumHeight: 10,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal"],
  animation: createBuiltInSymbolAnimationMetadata(["motion"])
};

const documentFixture = (): ScadaDocument => ({
  schemaVersion: "1.0.0",
  id: "animation-integration",
  metadata: {
    name: "Animation",
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
    snapToGrid: false,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
  nodes: [
    {
      id: "motor",
      name: "Motor",
      symbolType: motor.type,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      properties: {},
      bindings: [],
      layerId: "main",
      visible: true,
      locked: false
    }
  ],
  connections: [],
  variables: [],
  bindings: [],
  runtimeSettings: { refreshInterval: 100, defaultQuality: "unknown" }
});

describe("Phase 10.03 runtime to SVG integration", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("updates a stable SVG element incrementally and restores its base transform", () => {
    const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.dataset.scadaSymbol = "";
    root.setAttribute("transform", "translate(10 20)");
    document.body.append(root);
    const adapter = new SvgSymbolAnimationAdapter({ getElementForNode: () => root });
    const symbols = new InMemorySymbolRegistry();
    symbols.register(motor);
    const clock = new ManualAnimationClock();
    const frameDriver = new ManualAnimationFrameDriver();
    const runtime = new RuntimeAnimationManager({
      symbols,
      timeSource: clock,
      frameDriver,
      onSamples: (id, samples) => { adapter.applySamples(id, samples); }
    });
    runtime.loadDocument(documentFixture());
    runtime.play("motor", "motion");
    frameDriver.fireFrame(0);
    clock.set(500);
    frameDriver.fireFrame(500);
    expect(root.getAttribute("transform")).toBe("translate(10 20) rotate(180)");
    expect(document.body.firstElementChild).toBe(root);
    runtime.stopEntity("motor");
    expect(root.getAttribute("transform")).toBe("translate(10 20)");
    runtime.dispose();
    adapter.dispose();
  });
});
