import { describe, expect, it } from "vitest";
import {
  ManualAnimationClock,
  ManualAnimationFrameDriver,
  SharedAnimationScheduler
} from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import { RuntimeConnectionFlowManager } from "./connection-flow.js";

const document: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "benchmark",
  metadata: {
    name: "Benchmark",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 1,
    height: 1,
    background: "",
    gridSize: 1,
    gridVisible: false,
    snapToGrid: false,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "main", name: "Main", order: 0, visible: true, locked: false }],
  nodes: [],
  connections: Array.from({ length: 1000 }, (_, index) => ({
    id: `c-${String(index)}`,
    name: "c",
    source: { nodeId: "a", portId: "a" },
    target: { nodeId: "b", portId: "b" },
    routing: "direct" as const,
    waypoints: [],
    medium: "generic",
    direction: "forward" as const,
    style: {},
    layerId: "main",
    visible: true,
    locked: false,
    flowAnimation: { id: `f-${String(index)}`, mode: "dash" as const, primitive: "scalar" as const }
  })),
  variables: [],
  bindings: [],
  runtimeSettings: { refreshInterval: 100, defaultQuality: "good" }
};

describe("connection flow benchmark", () => {
  it("records one shared frame for 1000 dash connections", () => {
    const durations: number[] = [];
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const started = performance.now();
      const clock = new ManualAnimationClock();
      const driver = new ManualAnimationFrameDriver();
      const scheduler = new SharedAnimationScheduler({ timeSource: clock, frameDriver: driver });
      const manager = new RuntimeConnectionFlowManager({ scheduler, onSample: () => undefined });
      manager.loadDocument(document);
      scheduler.start();
      driver.fireFrame(0);
      clock.set(16);
      driver.fireFrame(16);
      manager.dispose();
      scheduler.dispose();
      durations.push(performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    const median = durations[Math.floor(durations.length / 2)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    console.info(
      `connection-flow-1000 median=${median.toFixed(3)}ms p95=${p95.toFixed(3)}ms iterations=20`
    );
    expect(durations).toHaveLength(20);
  });
});
