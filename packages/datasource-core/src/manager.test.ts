import { describe, expect, it, vi } from "vitest";
import type {
  BrowseRequest,
  BrowseResult,
  DataSourceAdapter,
  DataSourceCapabilities,
  DataSourceEvent,
  DataSourceEventListener,
  DataSourceStatus,
  ReadRequest,
  ReadResult,
  SubscriptionHandle,
  SubscriptionRequest,
  WriteRequest,
  WriteResult
} from "./contracts.js";
import { NO_DATA_SOURCE_PERMISSIONS } from "./contracts.js";
import { createDataSourceManager } from "./manager.js";
import type { DataSourceRegistration } from "./manager-contracts.js";
import { redactDiagnosticValue } from "./redaction.js";

const capabilities: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: true,
  write: true,
  browse: true,
  batchRead: false,
  batchWrite: false,
  historyRead: false,
  metadata: false
});

class ControlledAdapter implements DataSourceAdapter {
  public readonly capabilities = capabilities;
  public readonly permissions = NO_DATA_SOURCE_PERMISSIONS;
  public readonly identity;
  public disposed = 0;
  public unsubscribed = 0;
  public failConnect = false;
  #status: DataSourceStatus = { state: "idle", changedAt: 0 };
  #listeners = new Set<DataSourceEventListener>();
  public constructor(id: string, type = "controlled") {
    this.identity = Object.freeze({ id, type });
  }
  public connect(): Promise<void> {
    if (this.failConnect) return Promise.reject(new Error("connection failed"));
    this.#status = { state: "connected", changedAt: 1 };
    return Promise.resolve();
  }
  public disconnect(): Promise<void> {
    this.#status = { state: "disconnected", changedAt: 2 };
    return Promise.resolve();
  }
  public subscribe(
    _request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): SubscriptionHandle {
    this.#listeners.add(listener);
    let closed = false;
    return {
      id: `subscription-${this.#listeners.size}`,
      get closed() {
        return closed;
      },
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        ++this.unsubscribed;
        this.#listeners.delete(listener);
      }
    };
  }
  public emit(event: DataSourceEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
  public read(_request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    return Promise.resolve({ values: [], failures: [] });
  }
  public write(_request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    return Promise.resolve({ results: [] });
  }
  public browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    return Promise.resolve({ points: [] });
  }
  public getStatus(): Readonly<DataSourceStatus> {
    return this.#status;
  }
  public dispose(): Promise<void> {
    ++this.disposed;
    this.#status = { state: "disposed", changedAt: 3 };
    return Promise.resolve();
  }
}

const registration = (adapter: ControlledAdapter, enabled = true): DataSourceRegistration => ({
  descriptor: {
    id: adapter.identity.id,
    adapterType: adapter.identity.type,
    enabled,
    tags: ["test"],
    group: "group-a"
  },
  adapter
});
const request = (id: string): SubscriptionRequest => ({
  addresses: [{ sourceId: id, key: "temperature" }]
});
const valueEvent = (id: string, value: number): DataSourceEvent => ({
  type: "VALUE",
  adapter: { id, type: "controlled" },
  timestamp: 10,
  value: {
    address: { sourceId: id, key: "temperature" },
    value,
    quality: { level: "GOOD" },
    receivedTimestamp: 10
  }
});

describe("DataSourceManager", () => {
  it("rejects duplicate datasource IDs without mutating registry", async () => {
    const manager = createDataSourceManager();
    await manager.register(registration(new ControlledAdapter("source-a")));
    await expect(
      manager.register(registration(new ControlledAdapter("source-a")))
    ).rejects.toMatchObject({ code: "DATASOURCE_ALREADY_REGISTERED" });
    expect(manager.list()).toHaveLength(1);
    await manager.dispose();
  });

  it("lists and filters registrations in deterministic registration order", async () => {
    const manager = createDataSourceManager();
    await manager.register(registration(new ControlledAdapter("source-b")));
    await manager.register(registration(new ControlledAdapter("source-a"), false));
    expect(manager.list().map((source) => source.descriptor.id)).toEqual(["source-b", "source-a"]);
    expect(manager.list({ enabled: false, tag: "test" })).toHaveLength(1);
    await manager.dispose();
  });

  it("aggregates connectAll failures without disconnecting successful adapters", async () => {
    const good = new ControlledAdapter("good");
    const bad = new ControlledAdapter("bad");
    bad.failConnect = true;
    const manager = createDataSourceManager();
    await manager.register(registration(good));
    await manager.register(registration(bad));
    const result = await manager.connectAll();
    expect(result).toMatchObject({ succeeded: 1, failed: 1 });
    expect(good.getStatus().state).toBe("connected");
    expect(manager.state).toBe("degraded");
    await manager.dispose();
  });

  it("routes normalized events with source identity, generation, and manager sequence", async () => {
    const adapter = new ControlledAdapter("source-a");
    const sink = vi.fn();
    const observer = vi.fn();
    const manager = createDataSourceManager({ eventSink: sink, now: () => 20 });
    await manager.register(registration(adapter));
    manager.subscribe(observer);
    await manager.subscribeSource("source-a", request("source-a"));
    adapter.emit(valueEvent("source-a", 42));
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ type: "VALUE" }));
    expect(observer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "DATA_SOURCE_EVENT",
        sourceId: "source-a",
        generation: 1,
        managerSequence: 1
      })
    );
    expect(manager.getDiagnostics().sources[0]?.counters.dataEventsRouted).toBe(1);
    await manager.dispose();
  });

  it("stops accepting old-generation events and releases old resources after replacement", async () => {
    const oldAdapter = new ControlledAdapter("source-a");
    const replacement = new ControlledAdapter("source-a");
    const sink = vi.fn();
    const manager = createDataSourceManager({ eventSink: sink });
    await manager.register(registration(oldAdapter));
    await manager.subscribeSource("source-a", request("source-a"));
    await manager.replace("source-a", registration(replacement));
    oldAdapter.emit(valueEvent("source-a", 1));
    expect(sink).not.toHaveBeenCalled();
    expect(oldAdapter.unsubscribed).toBe(1);
    expect(oldAdapter.disposed).toBe(1);
    expect(manager.get("source-a")?.generation).toBe(2);
    await manager.dispose();
  });

  it("isolates listener failures and cleans every owned adapter on disposal", async () => {
    const first = new ControlledAdapter("first");
    const second = new ControlledAdapter("second");
    const healthyListener = vi.fn();
    const manager = createDataSourceManager();
    await manager.register(registration(first));
    await manager.register(registration(second));
    manager.subscribe(() => {
      throw new Error("observer failed");
    });
    manager.subscribe(healthyListener);
    await manager.subscribeSource("first", request("first"));
    first.emit(valueEvent("first", 3));
    expect(healthyListener).toHaveBeenCalled();
    await manager.dispose();
    expect(first.disposed).toBe(1);
    expect(second.disposed).toBe(1);
    await expect(
      manager.register(registration(new ControlledAdapter("later")))
    ).rejects.toMatchObject({ code: "DATASOURCE_MANAGER_DISPOSED" });
  });

  it("reports policy-driven stale health and critical aggregate health", async () => {
    let now = 0;
    const adapter = new ControlledAdapter("critical");
    const manager = createDataSourceManager({ now: () => now });
    await manager.register({
      ...registration(adapter),
      descriptor: { ...registration(adapter).descriptor, critical: true },
      healthPolicy: { enabled: true, staleAfterMs: 10, unhealthyAfterMs: 20 }
    });
    await manager.connect("critical");
    await manager.subscribeSource("critical", request("critical"));
    adapter.emit(valueEvent("critical", 1));
    now = 25;
    expect(manager.get("critical")?.health.state).toBe("UNHEALTHY");
    expect(manager.getSnapshot().aggregateHealth.state).toBe("UNHEALTHY");
    await manager.dispose();
  });
});

describe("diagnostic redaction", () => {
  it("redacts nested secrets, bearer tokens, URI credentials, and cycles", () => {
    const secret = "PHASE_9_07_SECRET_MUST_NOT_APPEAR";
    const input: Record<string, unknown> = {
      password: secret,
      nested: [{ authorization: `Bearer ${secret}` }],
      endpoint: `mqtt://user:${secret}@localhost`
    };
    input.self = input;
    const serialized = JSON.stringify(redactDiagnosticValue(input));
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("[CIRCULAR]");
  });
});
