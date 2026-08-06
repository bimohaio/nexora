import { describe, expect, it } from "vitest";
import {
  ManualAnimationClock,
  ManualAnimationFrameDriver,
  SharedAnimationScheduler
} from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import { RuntimeConnectionFlowManager } from "./connection-flow.js";

function documentWithFlow(count = 1): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "flow-document",
    metadata: {
      name: "Flow",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 100,
      height: 100,
      background: "transparent",
      gridSize: 10,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
    nodes: [],
    connections: Array.from({ length: count }, (_, index) => ({
      id: `connection-${String(index)}`,
      name: "Flow",
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "b", portId: "in" },
      routing: "direct" as const,
      waypoints: [],
      medium: "water",
      direction: "forward" as const,
      style: {},
      flowAnimation: {
        id: `flow-${String(index)}`,
        mode: "dash" as const,
        primitive: "scalar" as const,
        speed: 1
      },
      layerId: "main",
      visible: true,
      locked: false
    })),
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 100, defaultQuality: "good" }
  };
}

function fixture(): {
  clock: ManualAnimationClock;
  driver: ManualAnimationFrameDriver;
  scheduler: SharedAnimationScheduler;
  manager: RuntimeConnectionFlowManager;
  samples: { phase: number; direction: string; quality: string }[];
} {
  const clock = new ManualAnimationClock();
  const driver = new ManualAnimationFrameDriver();
  const samples: { phase: number; direction: string; quality: string }[] = [];
  const scheduler = new SharedAnimationScheduler({
    id: "test-flow",
    timeSource: clock,
    frameDriver: driver
  });
  const manager = new RuntimeConnectionFlowManager({
    scheduler,
    onSample: (sample) => samples.push(sample)
  });
  return { clock, driver, scheduler, manager, samples };
}

describe("RuntimeConnectionFlowManager", () => {
  it("uses one shared scheduler and supports speed, direction, pause and disposal", () => {
    const { clock, driver, scheduler, manager, samples } = fixture();
    manager.loadDocument(documentWithFlow(2));
    scheduler.start();
    driver.fireFrame(0);
    clock.set(250);
    driver.fireFrame(250);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(2);
    expect(samples.at(-1)?.phase).toBeCloseTo(0.1);
    manager.update("connection-1", { speed: 2, direction: "reverse" });
    clock.set(500);
    driver.fireFrame(500);
    expect(samples.at(-1)).toMatchObject({ direction: "reverse" });
    manager.pause();
    expect(scheduler.getSnapshot().pausedTaskIds).toHaveLength(2);
    manager.dispose();
    expect(manager.size).toBe(0);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(0);
  });

  it("validates runtime bindings, quality fallback and removed connections", () => {
    const { manager } = fixture();
    manager.loadDocument(documentWithFlow());
    manager.update("connection-0", { speed: Number.NaN });
    expect(manager.diagnostics.at(-1)?.code).toBe("CONNECTION_FLOW_INVALID_BINDING");
    manager.update("connection-0", { quality: "offline", flowPercentage: 75 });
    manager.loadDocument({ ...documentWithFlow(), connections: [] });
    expect(manager.size).toBe(0);
    manager.update("missing", { enabled: true });
    expect(manager.diagnostics.at(-1)?.code).toBe("CONNECTION_FLOW_TARGET_NOT_FOUND");
  });

  it("keeps diagnostics bounded under invalid input stress", () => {
    const { scheduler } = fixture();
    const manager = new RuntimeConnectionFlowManager({
      scheduler,
      onSample: () => undefined,
      diagnosticCapacity: 5
    });
    for (let index = 0; index < 5000; index += 1)
      manager.update(`missing-${String(index)}`, { enabled: true });
    expect(manager.diagnostics).toHaveLength(5);
  });

  it("creates and disposes 1000 connections without leaked scheduler tasks", () => {
    const { scheduler, manager } = fixture();
    manager.loadDocument(documentWithFlow(1000));
    expect(manager.size).toBe(1000);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(1000);
    manager.dispose();
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(0);
  });
});
