import { describe, expect, it } from "vitest";
import {
  ManualRuntimeScheduler,
  RuntimeBatchQueue,
  RuntimeDispatcher,
  RuntimeMemoryAudit,
  RuntimeObjectPool
} from "./index.js";

describe("runtime performance primitives", () => {
  it("batches duplicate inputs with stable latest-value ordering", () => {
    const queue = new RuntimeBatchQueue();
    queue.enqueueMany([
      { key: "motor-a", value: 100 },
      { key: "motor-b", value: 1 },
      { key: "motor-a", value: 103 }
    ]);
    expect(queue.flush()).toEqual([
      { key: "motor-a", value: 103 },
      { key: "motor-b", value: 1 }
    ]);
  });

  it("supports configurable dispatch coalescing and one scheduled callback", () => {
    const scheduler = new ManualRuntimeScheduler();
    const dispatched: number[] = [];
    const dispatcher = new RuntimeDispatcher({
      scheduler,
      dispatch: (updates) => {
        dispatched.push(updates[0]?.properties?.value as number);
      },
      mergeStrategy: (previous, next) => previous ?? next
    });
    for (let value = 0; value < 100; value += 1)
      dispatcher.enqueue({ symbolId: "motor-a", properties: { value } });
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flush();
    expect(dispatched).toEqual([0]);
    dispatcher.dispose();
  });

  it("bounds pooled allocations and detects retained runtime resources", () => {
    const pool = new RuntimeObjectPool(
      () => ({ value: 0 }),
      (entry) => {
        entry.value = 0;
      },
      2
    );
    const value = pool.acquire();
    value.value = 10;
    pool.release(value);
    expect(pool.acquire().value).toBe(0);

    const audit = new RuntimeMemoryAudit();
    audit.capture({
      activeSubscriptions: 1,
      cachedSnapshots: 1,
      cachedVisualStates: 100,
      queuedUpdates: 0,
      pooledObjects: 1,
      disposedResources: 0
    });
    expect(
      audit.hasPotentialLeak({
        activeSubscriptions: 2,
        cachedSnapshots: 1,
        cachedVisualStates: 100,
        queuedUpdates: 0,
        pooledObjects: 1,
        disposedResources: 0
      })
    ).toBe(true);
  });
});
