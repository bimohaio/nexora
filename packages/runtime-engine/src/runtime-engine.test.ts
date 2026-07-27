import type { PropertyBinding, ScadaDocument } from "@web-scada/core";
import type { JsonValue } from "@web-scada/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DataProvider,
  DataProviderStatusEvent,
  RuntimeEngineEvent,
  RuntimeValue,
  TagStoreListener
} from "./contracts.js";
import { createRuntimeEngine } from "./engine.js";
import { PassthroughBindingEvaluator } from "./evaluator.js";
import { InMemoryTagStore } from "./store.js";
import { RuntimeVisualStateResolver } from "./visual-state.js";

const value = (
  tagId: string,
  runtimeValue: JsonValue,
  timestamp = "2026-01-01T00:00:00.000Z",
  quality: RuntimeValue["quality"] = "good"
): RuntimeValue => ({
  tagId,
  value: runtimeValue,
  dataType:
    typeof runtimeValue === "number"
      ? "number"
      : typeof runtimeValue === "boolean"
        ? "boolean"
        : typeof runtimeValue === "string"
          ? "string"
          : "json",
  quality,
  timestamp
});

function documentWith(bindings: readonly PropertyBinding[]): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: "runtime-test",
    metadata: {
      name: "Runtime test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: []
    },
    canvas: {
      width: 1000,
      height: 800,
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
          width: 100,
          height: 80,
          rotation: 0,
          scaleX: 1,
          scaleY: 1
        },
        properties: { fill: "#000000" },
        bindings: bindings.map(({ id }) => id),
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
        medium: "water",
        direction: "none",
        style: { stroke: "#fff" },
        layerId: "layer",
        visible: true,
        locked: false
      }
    ],
    variables: [],
    bindings,
    runtimeSettings: {
      refreshInterval: 20,
      staleAfterMs: 100,
      defaultQuality: "unknown"
    }
  };
}

class TestProvider implements DataProvider {
  public connectCalls = 0;
  public disconnectCalls = 0;
  public subscribedTagIds: readonly string[] = [];
  public failConnections = 0;
  #listener: TagStoreListener | undefined;
  #statusListener: ((event: DataProviderStatusEvent) => void) | undefined;

  public connect(): Promise<void> {
    this.connectCalls += 1;
    return this.connectCalls <= this.failConnections
      ? Promise.reject(new Error("offline"))
      : Promise.resolve();
  }

  public disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return Promise.resolve();
  }

  public subscribe(tagIds: readonly string[], listener: TagStoreListener): () => void {
    this.subscribedTagIds = [...tagIds];
    this.#listener = listener;
    return () => {
      this.#listener = undefined;
    };
  }

  public subscribeStatus(listener: (event: DataProviderStatusEvent) => void): () => void {
    this.#statusListener = listener;
    return () => {
      this.#statusListener = undefined;
    };
  }

  public emit(runtimeValue: RuntimeValue): void {
    this.#listener?.(runtimeValue);
  }

  public emitStatus(event: DataProviderStatusEvent): void {
    this.#statusListener?.(event);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("InMemoryTagStore", () => {
  it("stores immutable ordered values, rejects older samples, and cleans subscriptions", () => {
    const store = new InMemoryTagStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.set(value("z", 2))).toBe(true);
    expect(store.set(value("a", 1))).toBe(true);
    expect(store.set(value("a", 0, "2025-12-31T23:59:59.000Z"))).toBe(false);
    expect(store.getAll().map(({ tagId }) => tagId)).toEqual(["a", "z"]);
    expect(store.markQuality(["a"], "offline")).toHaveLength(1);
    unsubscribe();
    store.set(value("b", 3));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe("RuntimeVisualStateResolver", () => {
  it("resolves tag bindings without mutating the document", () => {
    const bindings: readonly PropertyBinding[] = [
      {
        id: "level",
        source: { type: "tag", tagId: "tank.level" },
        target: { type: "node-property", nodeId: "pump", property: "level" },
        mode: "one-way",
        enabled: true
      },
      {
        id: "state",
        source: { type: "tag", tagId: "pump.state" },
        target: { type: "node-state", nodeId: "pump" },
        mode: "one-way",
        enabled: true
      },
      {
        id: "visible",
        source: { type: "tag", tagId: "pump.visible" },
        target: { type: "visibility", entityId: "pump" },
        mode: "one-way",
        enabled: true
      },
      {
        id: "pipe-color",
        source: { type: "tag", tagId: "pipe.color" },
        target: { type: "connection-property", connectionId: "pipe", property: "stroke" },
        mode: "one-way",
        enabled: true
      }
    ];
    const document = documentWith(bindings);
    const original = JSON.stringify(document);
    const store = new InMemoryTagStore();
    store.setMany([
      value("tank.level", 0.75),
      value("pump.state", "running"),
      value("pump.visible", false),
      value("pipe.color", "#22c55e")
    ]);
    const resolver = new RuntimeVisualStateResolver({
      document,
      store,
      evaluator: new PassthroughBindingEvaluator(),
      now: () => Date.parse("2026-01-01T00:00:00.000Z")
    });
    expect(resolver.getNodeProperties("pump")).toEqual({ level: 0.75 });
    expect(resolver.getNodeState("pump")).toBe("running");
    expect(resolver.getNodeVisibility("pump")).toBe(false);
    expect(resolver.getConnectionStyle("pipe")).toEqual({ stroke: "#22c55e" });
    expect(JSON.stringify(document)).toBe(original);

    store.markQuality(["pump.state"], "offline");
    expect(resolver.refresh(["pump.state"]).nodeIds).toEqual(["pump"]);
    expect(resolver.getNodeState("pump")).toBe("offline");
  });
});

describe("ProviderRuntimeEngine", () => {
  it("coordinates provider lifecycle, batches targeted updates, marks stale data, and disposes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-01-01T00:00:00.000Z");
    const binding: PropertyBinding = {
      id: "state",
      source: { type: "tag", tagId: "pump.state" },
      target: { type: "node-state", nodeId: "pump" },
      mode: "one-way",
      enabled: true
    };
    const provider = new TestProvider();
    const engine = createRuntimeEngine({ document: documentWith([binding]), provider });
    const events = vi.fn();
    engine.subscribe(events);

    await engine.start();
    expect(engine.getStatus()).toBe("running");
    expect(provider.subscribedTagIds).toEqual(["pump.state"]);
    provider.emit(value("pump.state", "running"));
    provider.emit(value("pump.state", "alarm", "2026-01-01T00:00:00.010Z"));
    expect(
      events.mock.calls
        .map(([event]) => event as RuntimeEngineEvent)
        .some((event) => event.type === "values")
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    const valueEvents = events.mock.calls
      .map(([event]) => event as RuntimeEngineEvent)
      .filter((event) => event.type === "values");
    const valueEvent = valueEvents.at(-1);
    expect(valueEvent).toMatchObject({
      values: [{ tagId: "pump.state", value: "alarm" }],
      affected: { nodeIds: ["pump"], connectionIds: [] }
    });
    expect(engine.visualState.getNodeState("pump")).toBe("alarm");
    expect(engine.getRuntimeSnapshot()).toMatchObject({ revision: 2, size: 1 });

    expect(engine.clear()).toMatchObject({ changed: true, revision: 3 });
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.visualState.getNodeState("pump")).toBeUndefined();
    const removalEvent = events.mock.calls
      .map(([event]) => event as RuntimeEngineEvent)
      .filter((event) => event.type === "values")
      .at(-1);
    expect(removalEvent).toMatchObject({
      values: [],
      affected: { nodeIds: ["pump"], connectionIds: [] }
    });

    provider.emit(value("pump.state", "alarm", "2026-01-01T00:00:00.020Z"));
    await vi.advanceTimersByTimeAsync(20);

    vi.setSystemTime("2026-01-01T00:00:01.000Z");
    engine.refreshFreshness();
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.store.get("pump.state")?.quality).toBe("uncertain");

    provider.emitStatus({ status: "disconnected" });
    expect(engine.getStatus()).toBe("reconnecting");
    expect(engine.store.get("pump.state")?.quality).toBe("offline");
    await engine.stop();
    expect(engine.getStatus()).toBe("stopped");
    await engine.dispose();
    expect(engine.getStatus()).toBe("disposed");
    await engine.dispose();
  });

  it("reconnects with bounded backoff after a connection failure", async () => {
    vi.useFakeTimers();
    const provider = new TestProvider();
    provider.failConnections = 1;
    const engine = createRuntimeEngine({
      document: documentWith([]),
      provider,
      reconnect: { initialDelayMs: 10, maximumDelayMs: 20 }
    });
    await engine.start();
    expect(engine.getStatus()).toBe("reconnecting");
    expect(engine.getSnapshot().reconnectAttempt).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    expect(provider.connectCalls).toBe(2);
    expect(engine.getStatus()).toBe("running");
    await engine.dispose();
  });

  it("does not dispose a caller-owned store", async () => {
    const provider = new TestProvider();
    const store = new InMemoryTagStore();
    const engine = createRuntimeEngine({ document: documentWith([]), provider, store });
    await engine.dispose();
    expect(store.disposed).toBe(false);
    expect(store.update({ key: "external", value: true }).changed).toBe(true);
    store.dispose();
  });
});
