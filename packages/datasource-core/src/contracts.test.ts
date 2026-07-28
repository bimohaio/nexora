import { describe, expect, it } from "vitest";
import {
  DataSourceError,
  NO_DATA_SOURCE_PERMISSIONS,
  assertConnectionTransition,
  assertOperationAllowed,
  isValidConnectionTransition,
  validateDataSourceIdentity,
  validateReadRequest,
  validateSubscriptionRequest,
  validateWriteRequest,
  type BrowseRequest,
  type BrowseResult,
  type DataSourceAdapter,
  type DataSourceCapabilities,
  type DataSourceEventListener,
  type DataSourceStatus,
  type ReadRequest,
  type ReadResult,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteRequest,
  type WriteResult
} from "./index.js";

const address = { sourceId: "source", key: "point" };
const capabilities: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: true,
  write: true,
  browse: false,
  batchRead: false,
  batchWrite: false,
  historyRead: false,
  metadata: false
});

class FakeAdapter implements DataSourceAdapter {
  public readonly identity = Object.freeze({ id: "fake-1", type: "fake" });
  public readonly capabilities = capabilities;
  public readonly permissions = Object.freeze({
    ...NO_DATA_SOURCE_PERMISSIONS,
    READ: true
  });
  #status: DataSourceStatus = Object.freeze({ state: "idle", changedAt: 0 });

  public connect(): Promise<void> {
    this.#assertActive();
    this.#status = Object.freeze({ state: "connected", changedAt: 1 });
    return Promise.resolve();
  }

  public disconnect(): Promise<void> {
    this.#assertActive();
    this.#status = Object.freeze({ state: "disconnected", changedAt: 2 });
    return Promise.resolve();
  }

  public subscribe(
    _request: Readonly<SubscriptionRequest>,
    _listener: DataSourceEventListener
  ): SubscriptionHandle {
    throw new DataSourceError("DATASOURCE_UNSUPPORTED_OPERATION", "Not supported.");
  }

  public read(_request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    if (this.#status.state === "disposed") {
      return Promise.reject(new DataSourceError("DATASOURCE_DISPOSED", "Adapter is disposed."));
    }
    return Promise.resolve(
      Object.freeze({ values: Object.freeze([]), failures: Object.freeze([]) })
    );
  }

  public write(_request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    return Promise.reject(new DataSourceError("DATASOURCE_ACCESS_DENIED", "Not permitted."));
  }

  public browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    return Promise.reject(
      new DataSourceError("DATASOURCE_UNSUPPORTED_OPERATION", "Not supported.")
    );
  }

  public getStatus(): Readonly<DataSourceStatus> {
    return this.#status;
  }

  public dispose(): Promise<void> {
    if (this.#status.state !== "disposed") {
      this.#status = Object.freeze({ state: "disposed", changedAt: 3 });
    }
    return Promise.resolve();
  }

  #assertActive(): void {
    if (this.#status.state === "disposed") {
      throw new DataSourceError("DATASOURCE_DISPOSED", "Adapter is disposed.");
    }
  }
}

describe("public contract validation", () => {
  it("validates adapter identity", () => {
    expect(() => {
      validateDataSourceIdentity({ id: "adapter-1", type: "simulator" });
    }).not.toThrow();
    expect(() => {
      validateDataSourceIdentity({ id: "", type: "simulator" });
    }).toThrow(/identity.id/);
  });

  it("validates subscription requests", () => {
    expect(() => {
      validateSubscriptionRequest({ addresses: [address] });
    }).not.toThrow();
    expect(() => {
      validateSubscriptionRequest({ addresses: [] });
    }).toThrow(/empty/);
    expect(() => {
      validateSubscriptionRequest({ addresses: [address, { ...address }] });
    }).toThrow(/duplicate/);
    expect(() => {
      validateSubscriptionRequest({ addresses: [address], samplingIntervalMs: -1 });
    }).toThrow(/samplingIntervalMs/);
    expect(() => {
      validateSubscriptionRequest({
        addresses: [address],
        deadband: { type: "percent", value: 101 }
      });
    }).toThrow(/deadband/);
  });

  it("validates read and write requests", () => {
    expect(() => {
      validateReadRequest({ addresses: [address], timeoutMs: Infinity });
    }).toThrow(/timeoutMs/);
    expect(() => {
      validateReadRequest({ addresses: [] });
    }).toThrow(/empty/);
    expect(() => {
      validateWriteRequest({ items: [] });
    }).toThrow(/items/);
    expect(() => {
      validateWriteRequest({ items: [{ address, value: Number.NaN }] });
    }).toThrow(DataSourceError);
    expect(() => {
      validateWriteRequest({ items: [{ address, value: "ok" }], timeoutMs: 100 });
    }).not.toThrow();
  });

  it("separates capabilities from conservative permissions", () => {
    expect(() => {
      assertOperationAllowed("browse", capabilities, NO_DATA_SOURCE_PERMISSIONS);
    }).toThrow(/not supported/);
    expect(() => {
      assertOperationAllowed("write", capabilities, NO_DATA_SOURCE_PERMISSIONS);
    }).toThrow(/not permitted/);
    expect(() => {
      assertOperationAllowed("write", capabilities, {
        ...NO_DATA_SOURCE_PERMISSIONS,
        WRITE: true
      });
    }).not.toThrow();
  });

  it("detects lifecycle transitions and makes disposed terminal", () => {
    expect(isValidConnectionTransition("idle", "connecting")).toBe(true);
    expect(isValidConnectionTransition("idle", "connected")).toBe(false);
    expect(() => {
      assertConnectionTransition("idle", "connected");
    }).toThrow(/Invalid/);
    expect(() => {
      assertConnectionTransition("disposed", "disposed");
    }).toThrowError(DataSourceError);
  });

  it("serializes typed errors without causes or credentials", () => {
    const cause = new Error("Authorization: Bearer secret");
    const error = new DataSourceError("DATASOURCE_CONNECTION_ERROR", "Connection failed.", {
      recoverable: true,
      timestamp: 123,
      cause,
      context: { retryAttempt: 2 }
    });
    expect(error.toJSON()).toEqual({
      name: "DataSourceError",
      code: "DATASOURCE_CONNECTION_ERROR",
      message: "Connection failed.",
      severity: "error",
      recoverable: true,
      timestamp: 123,
      context: { retryAttempt: 2 }
    });
    expect(JSON.stringify(error.toJSON())).not.toContain("secret");
  });

  it("defines reusable lifecycle behavior for future adapters", async () => {
    const adapter = new FakeAdapter();
    const identity = adapter.identity;
    expect(adapter.getStatus().state).toBe("idle");
    await adapter.connect();
    expect(adapter.getStatus().state).toBe("connected");
    await adapter.disconnect();
    expect(adapter.getStatus().state).toBe("disconnected");
    await expect(adapter.write({ items: [{ address, value: 1 }] })).rejects.toMatchObject({
      code: "DATASOURCE_ACCESS_DENIED"
    });
    await adapter.dispose();
    await adapter.dispose();
    expect(adapter.getStatus().state).toBe("disposed");
    expect(adapter.identity).toBe(identity);
    await expect(adapter.read({ addresses: [address] })).rejects.toMatchObject({
      code: "DATASOURCE_DISPOSED"
    });
  });
});
