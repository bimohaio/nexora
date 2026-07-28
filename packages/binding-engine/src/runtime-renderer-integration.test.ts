import type { PropertyBinding, ScadaDocument } from "@web-scada/core";
import {
  InMemoryTagStore,
  type RuntimeVisualSnapshot,
  type RuntimeVisualSnapshotDiff
} from "@web-scada/runtime-engine";
import { describe, expect, it, vi } from "vitest";
import { ManualBindingSchedulingAdapter, RuntimeBindingRendererIntegration } from "./index.js";

function document(bindings?: readonly PropertyBinding[]): ScadaDocument {
  const defaults: readonly PropertyBinding[] = [
    {
      id: "fill",
      source: { type: "tag", tagId: "pump.fill" },
      target: { type: "node-property", nodeId: "pump", property: "fill" },
      mode: "one-way",
      enabled: true
    },
    {
      id: "visible",
      source: { type: "tag", tagId: "pipe.visible" },
      target: { type: "visibility", entityId: "pipe" },
      mode: "one-way",
      enabled: true
    }
  ];
  return {
    schemaVersion: "1.0.0",
    id: "integration",
    metadata: {
      name: "Integration",
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
    nodes: [
      {
        id: "pump",
        name: "Pump",
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
        bindings: ["fill"],
        layerId: "layer",
        visible: true,
        locked: false
      }
    ],
    connections: [
      {
        id: "pipe",
        name: "Pipe",
        source: { nodeId: "pump", portId: "out" },
        target: { nodeId: "pump", portId: "in" },
        routing: "direct",
        waypoints: [],
        direction: "none",
        medium: "generic",
        style: {},
        layerId: "layer",
        visible: true,
        locked: false
      }
    ],
    variables: [],
    bindings: bindings ?? defaults,
    runtimeSettings: { refreshInterval: 16, defaultQuality: "unknown", locale: "en-US" }
  };
}

describe("RuntimeBindingRendererIntegration", () => {
  it("coalesces runtime changes and publishes only resolved dirty targets", () => {
    const store = new InMemoryTagStore({ now: () => 10 });
    const scheduler = new ManualBindingSchedulingAdapter();
    const renderRuntimeChanges =
      vi.fn<(snapshot: RuntimeVisualSnapshot, diff: RuntimeVisualSnapshotDiff) => void>();
    const integration = new RuntimeBindingRendererIntegration({
      document: document(),
      store,
      renderer: { renderRuntimeChanges },
      schedulingMode: "deferred",
      scheduler,
      now: () => 20
    });
    integration.start();
    scheduler.flushAll();
    renderRuntimeChanges.mockClear();

    store.update({ key: "pump.fill", value: "#ef4444", quality: "good" });
    store.update({ key: "pump.fill", value: "#22c55e", quality: "good" });
    store.update({ key: "unrelated", value: 1, quality: "good" });
    expect(renderRuntimeChanges).not.toHaveBeenCalled();
    scheduler.flushAll();

    expect(renderRuntimeChanges).toHaveBeenCalledOnce();
    const call = renderRuntimeChanges.mock.calls[0];
    if (call === undefined) throw new Error("Expected a runtime renderer commit.");
    const [snapshot, diff] = call;
    expect(snapshot.getNodeProperties("pump")).toEqual({ fill: "#22c55e" });
    expect(snapshot.getNodeQuality("pump")).toBe("good");
    expect(diff.updatedNodeIds).toEqual(["pump"]);
    expect(diff.updatedConnectionIds).toEqual([]);
    integration.dispose();
  });

  it("resolves connection visibility, isolates renderer failures, and stops cleanly", () => {
    const store = new InMemoryTagStore({ now: () => 10 });
    const diagnostics = vi.fn();
    const renderer = {
      renderRuntimeChanges: vi.fn(() => {
        throw new Error("renderer failure");
      })
    };
    const integration = new RuntimeBindingRendererIntegration({
      document: document(),
      store,
      renderer,
      schedulingMode: "immediate",
      onDiagnostic: diagnostics
    });
    integration.start();
    store.update({ key: "pipe.visible", value: false, quality: "uncertain" });
    expect(integration.getSnapshot().getConnectionVisibility("pipe")).toBe(false);
    expect(integration.getSnapshot().getConnectionQuality("pipe")).toBe("uncertain");
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BINDING_INTEGRATION_RENDERER_FAILED" })
    );
    const calls = renderer.renderRuntimeChanges.mock.calls.length;
    integration.dispose();
    store.update({ key: "pipe.visible", value: true, quality: "good" });
    expect(renderer.renderRuntimeChanges).toHaveBeenCalledTimes(calls);
  });

  it("clears removed bindings on document replacement and supports late renderers", () => {
    const store = new InMemoryTagStore({ now: () => 10 });
    store.update({ key: "pump.fill", value: "#ef4444", quality: "good" });
    const integration = new RuntimeBindingRendererIntegration({
      document: document(),
      store,
      schedulingMode: "immediate"
    });
    integration.start();
    expect(integration.getSnapshot().getNodeProperties("pump")).toEqual({
      fill: "#ef4444"
    });

    integration.attachDocument(document([]));
    expect(integration.getSnapshot().getNodeProperties("pump")).toEqual({});
    const renderRuntimeChanges = vi.fn();
    integration.attachRenderer({ renderRuntimeChanges });
    expect(renderRuntimeChanges).toHaveBeenCalledWith(
      integration.getSnapshot(),
      expect.objectContaining({ reset: true })
    );
  });
});
