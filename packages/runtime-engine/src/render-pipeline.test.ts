import { describe, expect, it, vi } from "vitest";
import type { RuntimeEngineEvent, RuntimeEngineListener } from "./contracts.js";
import { RuntimeEventBus } from "./events.js";
import { RuntimeRenderPipeline } from "./render-pipeline.js";
import { ManualRuntimeScheduler } from "./scheduler.js";

describe("RuntimeRenderPipeline", () => {
  it("coalesces visual commits and renders the dirty union without a document render", () => {
    let listener: RuntimeEngineListener | undefined;
    const source = {
      subscribe(next: RuntimeEngineListener): () => void {
        listener = next;
        return () => {
          listener = undefined;
        };
      }
    };
    const renderRuntimeChanges = vi.fn();
    const scheduler = new ManualRuntimeScheduler();
    const events = new RuntimeEventBus();
    const completed = vi.fn();
    events.on("RenderCompleted", completed);
    const pipeline = new RuntimeRenderPipeline({
      source,
      renderer: { renderRuntimeChanges },
      scheduler,
      events,
      now: () => 500
    });
    const makeEvent = (revision: number, nodeId: string): RuntimeEngineEvent =>
      ({
        type: "values",
        values: [],
        changedKeys: [],
        runtimeRevision: revision,
        affected: { nodeIds: [nodeId], connectionIds: [] },
        visualCommit: {
          previousSnapshot: {} as never,
          snapshot: {
            revision,
            timestamp: revision * 10,
            nodes: new Map(),
            connections: new Map(),
            getNodeState: () => undefined,
            getNodeProperties: () => undefined,
            getNodeVisibility: () => undefined,
            getNodeQuality: () => undefined,
            getConnectionStyle: () => undefined,
            getConnectionVisibility: () => undefined,
            getConnectionQuality: () => undefined
          },
          diff: {
            fromRevision: revision - 1,
            toRevision: revision,
            addedNodeIds: [],
            updatedNodeIds: [nodeId],
            removedNodeIds: [],
            addedConnectionIds: [],
            updatedConnectionIds: [],
            removedConnectionIds: [],
            reset: false
          }
        },
        timestamp: new Date(0).toISOString()
      }) satisfies RuntimeEngineEvent;
    listener?.(makeEvent(1, "pump"));
    listener?.(makeEvent(2, "valve"));
    expect(renderRuntimeChanges).not.toHaveBeenCalled();
    scheduler.flush();
    expect(renderRuntimeChanges).toHaveBeenCalledOnce();
    expect(renderRuntimeChanges.mock.calls[0]?.[1]).toMatchObject({
      fromRevision: 0,
      toRevision: 2,
      updatedNodeIds: ["pump", "valve"]
    });
    expect(completed).toHaveBeenCalledWith({
      revision: 2,
      timestamp: 500,
      updatedSymbols: 2
    });
    pipeline.dispose();
  });
});
