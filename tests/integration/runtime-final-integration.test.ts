import { describe, expect, it, vi } from "vitest";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import {
  createRuntimeEngine,
  createRuntimeRenderPipeline,
  createRuntimeSimulator,
  ManualRuntimeScheduler,
  type DataProvider,
  type RuntimeIncrementalRenderer
} from "../../packages/runtime-engine/src/index.js";
import { WATER_TREATMENT_DOCUMENT } from "../../apps/runtime-demo/src/sample-document.js";

const provider: DataProvider = {
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  subscribe: () => () => undefined
};

describe("Runtime Engine final integration", () => {
  it("connects simulator, store, resolver, snapshot, dispatch, and incremental renderer", async () => {
    const runtimeScheduler = new ManualRuntimeScheduler({ now: () => 1_000 });
    const renderScheduler = new ManualRuntimeScheduler({ now: () => 1_000 });
    const runtime = createRuntimeEngine({
      document: WATER_TREATMENT_DOCUMENT,
      provider,
      symbols: createExampleSymbolRegistry(),
      scheduler: runtimeScheduler
    });
    const renderRuntimeChanges = vi.fn<RuntimeIncrementalRenderer["renderRuntimeChanges"]>();
    const pipeline = createRuntimeRenderPipeline({
      source: runtime,
      renderer: { renderRuntimeChanges },
      scheduler: renderScheduler,
      now: () => 1_000
    });
    const simulator = createRuntimeSimulator({
      sink: runtime,
      scheduler: runtimeScheduler,
      scenario: ({ now }) => [
        { key: "process.raw-tank.level", value: 0.82, quality: "good", timestamp: now },
        { key: "process.feed-pump.state", value: "alarm", quality: "good", timestamp: now },
        { key: "control.beacon.state", value: "warning", quality: "good", timestamp: now },
        { key: "process.main-pipe.color", value: "#ef4444", quality: "good", timestamp: now }
      ]
    });

    simulator.tick();
    runtime.flush();
    expect(runtime.getRuntimeSnapshot()).toMatchObject({ revision: 1, size: 4 });
    expect(runtime.getVisualSnapshot().getNodeVisualState?.("node_raw_tank")?.level).toBe(0.82);
    expect(renderRuntimeChanges).not.toHaveBeenCalled();
    renderScheduler.flushAll();
    expect(renderRuntimeChanges).toHaveBeenCalledOnce();
    const renderedDiff = renderRuntimeChanges.mock.calls[0]?.[1];
    expect(renderedDiff).toMatchObject({
      reset: false,
      updatedConnectionIds: [
        "conn_inlet_pump",
        "conn_mixer_outlet",
        "conn_outlet_clean",
        "conn_pump_mixer",
        "conn_raw_inlet"
      ]
    });
    expect(renderedDiff?.updatedNodeIds).toEqual(
      expect.arrayContaining(["node_raw_tank", "node_feed_pump", "node_alarm_beacon"])
    );

    simulator.dispose();
    pipeline.dispose();
    await runtime.dispose();
    expect(runtime.subscriptions.size).toBe(0);
  });
});
