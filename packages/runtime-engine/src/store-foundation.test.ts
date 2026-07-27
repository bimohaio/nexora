import { describe, expect, it, vi } from "vitest";
import type {
  DataQuality,
  RuntimeDataPointInput,
  RuntimeDiagnostic,
  RuntimeStoreNotification
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import { ImmediateRuntimeScheduler, ManualRuntimeScheduler } from "./scheduler.js";
import { InMemoryTagStore } from "./store.js";

function expectRuntimeError(operation: () => void, code: string): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeEngineError);
    if (error instanceof RuntimeEngineError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected RuntimeEngineError: ${code}`);
}

describe("Phase 6.00 normalized runtime store", () => {
  it("normalizes JSON-safe values without mutating caller input", () => {
    const store = new InMemoryTagStore({ now: () => 1000, defaultQuality: "unknown" });
    const caller = {
      key: "plant.tank.level",
      value: { z: -0, nested: [true, null, "safe"] },
      source: "simulator",
      sequence: 1,
      metadata: { unit: "%" }
    };
    const before = JSON.stringify(caller);
    const result = store.update(caller);

    expect(result).toMatchObject({ changed: true, revision: 1 });
    expect(store.getDataPoint(caller.key)).toEqual({
      key: caller.key,
      value: { nested: [true, null, "safe"], z: 0 },
      quality: "unknown",
      timestamp: 1000,
      ingestionTimestamp: 1000,
      source: "simulator",
      sequence: 1,
      metadata: { unit: "%" }
    });
    expect(JSON.stringify(caller)).toBe(before);
    expect(Object.isFrozen(store.getDataPoint(caller.key)?.value)).toBe(true);

    caller.value.nested[0] = false;
    caller.metadata.unit = "changed";
    expect(store.getDataPoint(caller.key)?.value).toEqual({
      nested: [true, null, "safe"],
      z: 0
    });
    expect(store.getDataPoint(caller.key)?.metadata).toEqual({ unit: "%" });
  });

  it.each([
    ["function", () => undefined],
    ["symbol", Symbol("invalid")],
    ["bigint", BigInt(1)],
    ["date", new Date(0)],
    ["infinity", Number.POSITIVE_INFINITY]
  ])("rejects non-JSON %s values atomically", (_name, invalidValue) => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const result = store.updateMany([
      { key: "valid", value: 1 },
      { key: "invalid", value: invalidValue }
    ]);
    expect(result).toMatchObject({
      changed: false,
      revision: 0,
      accepted: 0,
      rejected: 2
    });
    expect(result.diagnostics[0]?.code).toBe("RUNTIME_INVALID_VALUE");
    expect(store.snapshot().size).toBe(0);
  });

  it("rejects cyclic values, unsafe keys, invalid metadata, timestamps, sequences, and quality", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const unsafe = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    const cases: readonly RuntimeDataPointInput[] = [
      { key: "cyclic", value: cyclic },
      { key: "unsafe", value: unsafe },
      { key: "metadata", value: 1, metadata: { bad: () => undefined } },
      { key: "timestamp", value: 1, timestamp: Number.NaN },
      { key: "sequence", value: 1, sequence: -1 },
      { key: "source", value: 1, source: " " },
      { key: "quality", value: 1, quality: "invalid" as DataQuality },
      { key: "", value: 1 }
    ];
    const codes = cases.map((input) => store.update(input).diagnostics[0]?.code);
    expect(codes).toEqual([
      "RUNTIME_INVALID_VALUE",
      "RUNTIME_INVALID_VALUE",
      "RUNTIME_INVALID_METADATA",
      "RUNTIME_INVALID_TIMESTAMP",
      "RUNTIME_INVALID_SEQUENCE",
      "RUNTIME_INVALID_SOURCE",
      "RUNTIME_INVALID_QUALITY",
      "RUNTIME_INVALID_KEY"
    ]);
    expect(store.revision).toBe(0);
  });

  it("treats quality detail, quality, and source timestamp changes deterministically", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    store.update({ key: "quality", value: 1, quality: "good", timestamp: 10 });
    expect(
      store.update({ key: "quality", value: 1, quality: "uncertain", timestamp: 10 })
    ).toMatchObject({ changed: true, revision: 2 });
    expect(
      store.update({
        key: "quality",
        value: 1,
        quality: "uncertain",
        qualityDetail: "stale",
        timestamp: 10
      })
    ).toMatchObject({ changed: true, revision: 3 });
    expect(
      store.update({
        key: "quality",
        value: 1,
        quality: "uncertain",
        qualityDetail: "stale",
        timestamp: 11
      })
    ).toMatchObject({ changed: true, revision: 4 });
    expect(
      store.update({
        key: "quality",
        value: 1,
        quality: "uncertain",
        qualityDetail: "stale",
        timestamp: 11
      })
    ).toMatchObject({ changed: false, revision: 4 });
  });

  it("commits one deterministic revision and change set per atomic batch", () => {
    let now = 1000;
    const store = new InMemoryTagStore({ now: () => now, defaultQuality: "good" });
    const notifications: RuntimeStoreNotification[] = [];
    store.subscribeChanges((notification) => {
      notifications.push(notification);
    });
    const added = store.updateMany([
      { key: "z", value: 2, timestamp: 10 },
      { key: "a", value: 1, timestamp: 10 }
    ]);
    expect(added.changeSet).toMatchObject({
      previousRevision: 0,
      revision: 1,
      addedKeys: ["a", "z"],
      updatedKeys: [],
      removedKeys: []
    });
    expect(notifications).toHaveLength(1);

    now = 2000;
    const noOp = store.updateMany([
      { key: "a", value: 1, quality: "good", timestamp: 10 },
      { key: "z", value: 2, quality: "good", timestamp: 10 }
    ]);
    expect(noOp).toMatchObject({ changed: false, revision: 1 });
    expect(notifications).toHaveLength(1);

    const mixed = store.updateMany([
      { key: "a", value: 3, quality: "good", timestamp: 11 },
      { key: "m", value: 4, quality: "good", timestamp: 11 }
    ]);
    expect(mixed.changeSet).toMatchObject({
      previousRevision: 1,
      revision: 2,
      addedKeys: ["m"],
      updatedKeys: ["a"]
    });
    expect(store.remove("z").changeSet?.removedKeys).toEqual(["z"]);
    expect(store.remove("missing")).toMatchObject({ changed: false, revision: 3 });
    expect(store.clear()).toMatchObject({ changed: true, revision: 4 });
    expect(store.clear()).toMatchObject({ changed: false, revision: 4 });
  });

  it("rejects duplicate batch keys and protects ordering by sequence or source timestamp", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    expect(
      store.updateMany([
        { key: "duplicate", value: 1 },
        { key: "duplicate", value: 2 }
      ])
    ).toMatchObject({ changed: false, revision: 0, rejected: 2 });

    store.update({ key: "ordered", value: 1, timestamp: 100, sequence: 5 });
    expect(store.update({ key: "ordered", value: 2, timestamp: 200, sequence: 4 })).toMatchObject({
      changed: false,
      revision: 1
    });
    expect(store.getDataPoint("ordered")?.value).toBe(1);

    store.update({ key: "timestamp", value: 1, timestamp: 100 });
    expect(store.update({ key: "timestamp", value: 2, timestamp: 99 })).toMatchObject({
      changed: false,
      revision: 2
    });
  });

  it("returns cached immutable snapshots isolated from later writes", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const empty = store.snapshot();
    expect(empty).toBe(store.snapshot());
    expect(empty).toMatchObject({ revision: 0, timestamp: 1000, size: 0 });

    store.update({ key: "a", value: { state: true } });
    const first = store.snapshot();
    expect(first).not.toBe(empty);
    expect(first).toBe(store.snapshot());
    store.update({ key: "b", value: 2 });
    expect(first.revision).toBe(1);
    expect(first.has("b")).toBe(false);
    expect(Object.isFrozen(first.getAll())).toBe(true);
    expect(Object.isFrozen(first.get("a"))).toBe(true);
  });

  it("isolates subscriber failures and defines dispatch-time subscription behavior", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const store = new InMemoryTagStore({
      now: () => 1000,
      onDiagnostic: (entry) => {
        diagnostics.push(entry);
      }
    });
    const order: string[] = [];
    const subscriptions: {
      first?: ReturnType<InMemoryTagStore["subscribeChanges"]>;
    } = {};
    const firstSubscription = store.subscribeChanges(() => {
      order.push("first");
      subscriptions.first?.unsubscribe();
      store.subscribeChanges(() => {
        order.push("late");
      });
    });
    subscriptions.first = firstSubscription;
    store.subscribeChanges(() => {
      order.push("throwing");
      throw new Error("isolated");
    });
    store.subscribeChanges(() => {
      order.push("last");
    });

    store.update({ key: "a", value: 1 });
    expect(order).toEqual(["first", "throwing", "last"]);
    expect(diagnostics.map(({ code }) => code)).toEqual(["RUNTIME_SUBSCRIBER_ERROR"]);
    firstSubscription.unsubscribe();
    expect(firstSubscription.closed).toBe(true);

    order.length = 0;
    store.update({ key: "b", value: 2 });
    expect(order).toEqual(["throwing", "last", "late"]);
  });

  it("rejects reentrant writes and keeps independent instances isolated", () => {
    const first = new InMemoryTagStore({ now: () => 1000 });
    const second = new InMemoryTagStore({ now: () => 2000 });
    let reentrantError: unknown;
    first.subscribeChanges(() => {
      try {
        first.update({ key: "nested", value: true });
      } catch (error) {
        reentrantError = error;
      }
    });
    first.update({ key: "first", value: 1 });
    second.update({ key: "second", value: 2 });
    expect(reentrantError).toBeInstanceOf(RuntimeEngineError);
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(1);
    expect(first.has("second")).toBe(false);
    expect(second.has("first")).toBe(false);

    first.dispose();
    first.dispose();
    expect(first.disposed).toBe(true);
    expectRuntimeError(() => first.update({ key: "after", value: 3 }), "RUNTIME_DISPOSED");
    expect(second.update({ key: "still-alive", value: 4 }).changed).toBe(true);
  });
});

describe("Phase 6.00 task schedulers", () => {
  it("runs immediate tasks and rejects scheduling after disposal", () => {
    const scheduler = new ImmediateRuntimeScheduler();
    const task = vi.fn();
    scheduler.schedule(task);
    expect(task).toHaveBeenCalledOnce();
    scheduler.dispose();
    expectRuntimeError(() => scheduler.schedule(task), "RUNTIME_DISPOSED");
  });

  it("queues, cancels, flushes, isolates failures, and disposes manual tasks", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const scheduler = new ManualRuntimeScheduler({
      now: () => 1000,
      onDiagnostic: (entry) => {
        diagnostics.push(entry);
      }
    });
    const order: string[] = [];
    const canceled = scheduler.schedule(() => {
      order.push("canceled");
    });
    canceled.cancel();
    canceled.cancel();
    scheduler.schedule(() => {
      throw new Error("isolated");
    });
    scheduler.schedule(() => {
      order.push("last");
    });
    expect(scheduler.pendingCount).toBe(2);
    scheduler.flush();
    expect(order).toEqual(["last"]);
    expect(diagnostics[0]?.code).toBe("RUNTIME_SCHEDULER_ERROR");

    scheduler.schedule(() => {
      order.push("never");
    });
    scheduler.dispose();
    scheduler.dispose();
    expect(order).toEqual(["last"]);
    expect(scheduler.pendingCount).toBe(0);
  });
});
