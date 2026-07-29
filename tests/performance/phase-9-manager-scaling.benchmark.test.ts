import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  NO_DATA_SOURCE_PERMISSIONS,
  createDataSourceManager,
  type BrowseRequest,
  type BrowseResult,
  type DataSourceAdapter,
  type DataSourceCapabilities,
  type DataSourceStatus,
  type ReadRequest,
  type ReadResult,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteRequest,
  type WriteResult
} from "../../packages/datasource-core/src/index.js";

const capabilities: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: true,
  write: false,
  browse: false,
  batchRead: false,
  batchWrite: false,
  historyRead: false,
  metadata: false
});

class BenchmarkAdapter implements DataSourceAdapter {
  public readonly identity;
  public readonly capabilities = capabilities;
  public readonly permissions = NO_DATA_SOURCE_PERMISSIONS;
  #status: DataSourceStatus = { state: "idle", changedAt: 0 };
  public constructor(id: string) {
    this.identity = Object.freeze({ id, type: "benchmark" });
  }
  public connect(): Promise<void> {
    this.#status = { state: "connected", changedAt: 1 };
    return Promise.resolve();
  }
  public disconnect(): Promise<void> {
    this.#status = { state: "disconnected", changedAt: 2 };
    return Promise.resolve();
  }
  public subscribe(_request: Readonly<SubscriptionRequest>): SubscriptionHandle {
    return { id: "unused", closed: false, unsubscribe: () => undefined };
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
    this.#status = { state: "disposed", changedAt: 3 };
    return Promise.resolve();
  }
}

describe("Phase 9 manager scaling measurement", () => {
  it("measures 1, 5, 10, 25, 50, and 100 source lifecycle and snapshot costs", async () => {
    const rows: {
      sources: number;
      registerMs: number;
      connectMs: number;
      snapshotMs: number;
      disposeMs: number;
      heapDeltaBytes: number;
    }[] = [];
    for (const sourceCount of [1, 5, 10, 25, 50, 100]) {
      const heapBefore = process.memoryUsage().heapUsed;
      const manager = createDataSourceManager({ historyCapacity: 0 });
      const registerStarted = performance.now();
      for (let index = 0; index < sourceCount; index += 1) {
        const adapter = new BenchmarkAdapter(`source-${index}`);
        await manager.register({
          descriptor: {
            id: adapter.identity.id,
            adapterType: adapter.identity.type,
            enabled: true
          },
          adapter
        });
      }
      const registeredAt = performance.now();
      await manager.connectAll();
      const connectedAt = performance.now();
      const snapshotStarted = performance.now();
      const snapshot = manager.getDiagnostics();
      const snapshotAt = performance.now();
      await manager.dispose();
      const disposedAt = performance.now();
      rows.push({
        sources: sourceCount,
        registerMs: registeredAt - registerStarted,
        connectMs: connectedAt - registeredAt,
        snapshotMs: snapshotAt - snapshotStarted,
        disposeMs: disposedAt - snapshotAt,
        heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore
      });
      expect(snapshot.sources).toHaveLength(sourceCount);
      expect(manager.state).toBe("disposed");
    }
    console.table(rows);
  });
});
