import { describe, expect, it, vi } from "vitest";
import type {
  RuntimeObserver,
  RuntimeVisualCommitEvent,
  RuntimeVisualSnapshot
} from "./contracts.js";
import { RuntimeEventBus } from "./events.js";
import { RuntimeSubscriptionManager } from "./subscriptions.js";

function snapshot(revision: number): RuntimeVisualSnapshot {
  return Object.freeze({
    revision,
    timestamp: revision * 100,
    nodes: new Map(),
    connections: new Map(),
    getNodeState: () => undefined,
    getNodeProperties: () => undefined,
    getNodeVisibility: () => undefined,
    getNodeQuality: () => undefined,
    getConnectionStyle: () => undefined,
    getConnectionVisibility: () => undefined,
    getConnectionQuality: () => undefined
  });
}

function commit(): RuntimeVisualCommitEvent {
  return Object.freeze({
    previousSnapshot: snapshot(1),
    snapshot: snapshot(2),
    diff: Object.freeze({
      fromRevision: 1,
      toRevision: 2,
      addedNodeIds: Object.freeze(["new-symbol"]),
      updatedNodeIds: Object.freeze(["pump", "valve"]),
      removedNodeIds: Object.freeze(["old-symbol"]),
      addedConnectionIds: Object.freeze([]),
      updatedConnectionIds: Object.freeze([]),
      removedConnectionIds: Object.freeze([]),
      reset: false,
      changedNodeProperties: Object.freeze({
        pump: Object.freeze(["speed", "state"]),
        valve: Object.freeze(["position"])
      })
    })
  });
}

describe("RuntimeSubscriptionManager", () => {
  it("returns stable idempotent handles and prevents duplicate registration", () => {
    const events = new RuntimeEventBus();
    const created = vi.fn();
    const disposed = vi.fn();
    events.on("SubscriptionCreated", created);
    events.on("SubscriptionDisposed", disposed);
    const manager = new RuntimeSubscriptionManager({ events, now: () => 10 });
    const observer: RuntimeObserver = { onSnapshot: vi.fn() };
    const first = manager.subscribe(observer, { symbolIds: ["pump"] });
    const duplicate = manager.subscribe(observer, { symbolIds: ["pump", "pump"] });
    expect(duplicate).toBe(first);
    expect(first.active).toBe(true);
    expect(manager.size).toBe(1);
    expect(created).toHaveBeenCalledOnce();
    first.dispose();
    first.dispose();
    expect(first.disposed).toBe(true);
    expect(manager.size).toBe(0);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("filters by symbol, property, and change type without notifying unrelated observers", () => {
    const manager = new RuntimeSubscriptionManager();
    const pump = vi.fn();
    const valve = vi.fn();
    const removed = vi.fn();
    manager.subscribe(
      { onSnapshot: pump },
      { symbolIds: ["pump"], properties: ["state"], changeTypes: ["updated"] }
    );
    manager.subscribe({ onSnapshot: valve }, { symbolIds: ["valve"], properties: ["state"] });
    manager.subscribe({ onSnapshot: removed }, { changeTypes: ["removed"] });
    manager.publishSnapshot(commit());
    expect(pump).toHaveBeenCalledOnce();
    expect(pump.mock.calls[0]?.[0]).toMatchObject({
      revision: 2,
      symbolIds: ["pump"],
      changeTypes: ["updated"]
    });
    expect(Object.isFrozen(pump.mock.calls[0]?.[0])).toBe(true);
    expect(valve).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledOnce();
  });

  it("isolates listener failures and releases every observer on disposal", () => {
    const manager = new RuntimeSubscriptionManager();
    manager.subscribe({
      onSnapshot: () => {
        throw new Error("listener failure");
      }
    });
    const later = vi.fn();
    const handle = manager.subscribe({ onSnapshot: later });
    manager.publishSnapshot(commit());
    expect(later).toHaveBeenCalledOnce();
    manager.dispose();
    expect(handle.disposed).toBe(true);
    expect(manager.size).toBe(0);
    manager.publishSnapshot(commit());
    expect(later).toHaveBeenCalledOnce();
    expect(() => manager.subscribe({})).toThrow("disposed");
  });

  it("publishes immutable value, revision, and status observations", () => {
    const manager = new RuntimeSubscriptionManager();
    const onRuntimeValues = vi.fn();
    const onRevision = vi.fn();
    const onStatus = vi.fn();
    manager.subscribe({ onRuntimeValues, onRevision, onStatus });
    const values = Object.freeze([]);
    manager.publishValues(
      Object.freeze({
        values,
        changedKeys: Object.freeze(["pump.speed"]),
        revision: 2,
        timestamp: 200
      })
    );
    manager.publishSnapshot(commit());
    manager.publishStatus(
      Object.freeze({ previousStatus: "idle", status: "running", timestamp: 200 })
    );
    expect(onRuntimeValues).toHaveBeenCalledOnce();
    expect(onRevision).toHaveBeenCalledWith({
      previousRevision: 1,
      revision: 2,
      timestamp: 200
    });
    expect(onStatus).toHaveBeenCalledOnce();
  });
});
