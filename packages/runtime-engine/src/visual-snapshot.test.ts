import type { PropertyBinding, ScadaDocument } from "@web-scada/core";
import { describe, expect, it, vi } from "vitest";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import type { DataProvider, RuntimeEngineEvent, RuntimeVisualStateReader } from "./contracts.js";
import { createRuntimeEngine } from "./engine.js";
import { ManualRuntimeScheduler } from "./scheduler.js";
import { createRuntimeSimulator } from "./simulator.js";
import { RuntimeVisualSnapshotRepository } from "./visual-snapshot.js";

const provider: DataProvider = {
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  subscribe: () => () => undefined
};

function runtimeDocument(): ScadaDocument {
  const binding: PropertyBinding = {
    id: "pump-state",
    source: { type: "tag", tagId: "pump.state" },
    target: { type: "node-state", nodeId: "pump-1" },
    mode: "one-way",
    enabled: true
  };
  return {
    schemaVersion: "1.0.0",
    id: "visual-runtime-test",
    metadata: {
      name: "Visual runtime test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 100,
      height: 100,
      background: "#000",
      gridSize: 10,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "px",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "layer", name: "Layer", order: 0, visible: true, locked: false }],
    nodes: ["pump-1", "pump-2"].map((id) => ({
      id,
      name: id,
      symbolType: "equipment.pump",
      transform: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1
      },
      properties: {},
      bindings: id === "pump-1" ? [binding.id] : [],
      layerId: "layer",
      visible: true,
      locked: false
    })),
    connections: [],
    variables: [],
    bindings: [binding],
    runtimeSettings: { refreshInterval: 16, defaultQuality: "unknown" }
  };
}

describe("RuntimeVisualSnapshotRepository", () => {
  it("publishes immutable snapshots with structural sharing and deterministic diffs", () => {
    let state: "normal" | "running" = "normal";
    const callerProperties = { nested: { value: 1 } };
    const reader: RuntimeVisualStateReader = {
      getNodeState: () => state,
      getNodeProperties: () => callerProperties,
      getNodeVisibility: () => undefined,
      getNodeQuality: () => "good",
      getConnectionStyle: () => undefined,
      getConnectionVisibility: () => undefined,
      getConnectionQuality: () => undefined
    };
    let now = 100;
    const repository = new RuntimeVisualSnapshotRepository(runtimeDocument(), reader, () => now);
    const before = repository.snapshot;
    callerProperties.nested.value = 99;
    expect(before.nodes.get("pump-1")?.properties).toEqual({ nested: { value: 1 } });
    const unchangedPump = before.nodes.get("pump-2");
    state = "running";
    now = 200;
    const commit = repository.commit({ nodeIds: ["pump-1"], connectionIds: [] });
    expect(commit?.diff).toMatchObject({
      fromRevision: 0,
      toRevision: 1,
      updatedNodeIds: ["pump-1"]
    });
    expect(commit?.snapshot.timestamp).toBe(200);
    expect(commit?.snapshot.nodes.get("pump-2")).toBe(unchangedPump);
    expect(before.nodes.get("pump-1")?.state).toBe("normal");
    expect("set" in repository.snapshot.nodes).toBe(false);
    expect(Object.isFrozen(repository.snapshot.nodes.get("pump-1"))).toBe(true);
    expect(repository.commit({ nodeIds: ["pump-1"], connectionIds: [] })).toBeUndefined();
    expect(repository.snapshot.revision).toBe(1);
  });
});

describe("resolved runtime snapshot scheduling", () => {
  it("coalesces a burst into one commit and queues reentrant updates for the next flush", async () => {
    const scheduler = new ManualRuntimeScheduler({ now: () => 1_000 });
    const engine = createRuntimeEngine({
      document: runtimeDocument(),
      provider,
      scheduler
    });
    const commits: RuntimeEngineEvent[] = [];
    engine.subscribe((event) => {
      commits.push(event);
      if (event.type === "values" && event.visualCommit.snapshot.revision === 1)
        engine.update({ key: "pump.state", value: "alarm", quality: "good" });
    });
    engine.update({ key: "pump.state", value: "normal", quality: "good" });
    engine.update({ key: "pump.state", value: "running", quality: "good" });
    expect(engine.getVisualSnapshot().revision).toBe(0);
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flushOne();
    expect(engine.getVisualSnapshot().revision).toBe(1);
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flushAll();
    expect(engine.getVisualSnapshot().revision).toBe(2);
    expect(commits.filter(({ type }) => type === "values")).toHaveLength(2);

    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    unsubscribe();
    engine.update({ key: "pump.state", value: "warning", quality: "good" });
    scheduler.flushAll();
    expect(listener).not.toHaveBeenCalled();
    await engine.dispose();
    expect(scheduler.pendingCount).toBe(0);
  });

  it("keeps instances and caller-owned design data isolated", async () => {
    const document = runtimeDocument();
    const original = JSON.stringify(document);
    const firstScheduler = new ManualRuntimeScheduler({ now: () => 100 });
    const secondScheduler = new ManualRuntimeScheduler({ now: () => 200 });
    const first = createRuntimeEngine({ document, provider, scheduler: firstScheduler });
    const second = createRuntimeEngine({ document, provider, scheduler: secondScheduler });
    first.update({ key: "pump.state", value: "running", quality: "good" });
    firstScheduler.flushAll();
    expect(first.getVisualSnapshot().revision).toBe(1);
    expect(second.getVisualSnapshot().revision).toBe(0);
    expect(JSON.stringify(document)).toBe(original);
    await first.dispose();
    await second.dispose();
  });

  it("routes filtered engine commits to runtime observers and stops after handle disposal", async () => {
    const scheduler = new ManualRuntimeScheduler({ now: () => 1_000 });
    const engine = createRuntimeEngine({
      document: runtimeDocument(),
      provider,
      scheduler
    });
    const renderRuntimeChanges = vi.fn();
    const handle = engine.subscriptions.subscribeSymbol("pump-1", {
      onSnapshot: ({ previousSnapshot, currentSnapshot, symbolIds }) => {
        renderRuntimeChanges(currentSnapshot, {
          fromRevision: previousSnapshot.revision,
          toRevision: currentSnapshot.revision,
          addedNodeIds: [],
          updatedNodeIds: symbolIds,
          removedNodeIds: [],
          addedConnectionIds: [],
          updatedConnectionIds: [],
          removedConnectionIds: [],
          reset: false
        });
      }
    });
    const simulator = createRuntimeSimulator({
      sink: engine,
      scheduler,
      scenario: ({ now }) => [
        { key: "pump.state", value: "running", quality: "good", timestamp: now }
      ]
    });
    simulator.tick();
    scheduler.flushAll();
    expect(renderRuntimeChanges).toHaveBeenCalledOnce();
    expect(renderRuntimeChanges.mock.calls[0]?.[1]).toMatchObject({
      updatedNodeIds: ["pump-1"],
      toRevision: 1
    });
    handle.dispose();
    engine.update({ key: "pump.state", value: "alarm", quality: "good" });
    scheduler.flushAll();
    expect(renderRuntimeChanges).toHaveBeenCalledOnce();
    simulator.dispose();
    const engineOwnedHandle = engine.subscriptions.subscribeSnapshot({});
    await engine.dispose();
    expect(handle.disposed).toBe(true);
    expect(engineOwnedHandle.disposed).toBe(true);
    expect(engine.subscriptions.disposed).toBe(true);
  });

  it("publishes temporary visual overrides as incremental immutable commits", async () => {
    const document = runtimeDocument();
    const original = JSON.stringify(document);
    const scheduler = new ManualRuntimeScheduler({ now: () => 1_000 });
    const engine = createRuntimeEngine({
      document,
      provider,
      scheduler,
      symbols: createExampleSymbolRegistry()
    });
    const events: RuntimeEngineEvent[] = [];
    engine.subscribe((event) => {
      events.push(event);
    });
    expect(engine.setVisualOverride("pump-1", { alarm: true })).toBe(true);
    const overrideEvent = events.find(({ type }) => type === "values");
    expect(overrideEvent?.type === "values" && overrideEvent.visualCommit.diff).toMatchObject({
      updatedNodeIds: ["pump-1"]
    });
    expect(engine.getVisualSnapshot().getNodeVisualState?.("pump-1")).toMatchObject({
      effectiveState: "alarm",
      alarm: true
    });
    expect(engine.clearVisualOverride("pump-1")).toBe(true);
    expect(JSON.stringify(document)).toBe(original);
    await engine.dispose();
  });
});
