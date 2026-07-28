import { describe, expect, it, vi } from "vitest";
import {
  createDataSourceLifecycleController,
  createExponentialReconnectPolicy,
  createSubscriptionManager,
  type DataSourceEvent,
  type DataSourceEventListener,
  type DataSourceLifecycleController,
  type NormalizedSubscriptionRequest,
  type SubscriptionActivationContext,
  type SubscriptionHandle,
  type SubscriptionManager,
  type SubscriptionTransport
} from "./index.js";

const request = Object.freeze({
  addresses: Object.freeze([{ sourceId: "source", key: "point" }]),
  samplingIntervalMs: 100
});

interface Harness {
  readonly lifecycle: DataSourceLifecycleController;
  readonly manager: SubscriptionManager;
  readonly activate: SubscriptionTransport["activate"];
  readonly listener: DataSourceEventListener | undefined;
  readonly activationContext: SubscriptionActivationContext | undefined;
  readonly transportClosed: number;
}

function harness(): Harness {
  let transportListener: DataSourceEventListener | undefined;
  let activationContext: SubscriptionActivationContext | undefined;
  let transportClosed = 0;
  const activate: SubscriptionTransport["activate"] = vi.fn(
    (
      _request: unknown,
      listener: DataSourceEventListener,
      context: SubscriptionActivationContext
    ): Promise<SubscriptionHandle> => {
      transportListener = listener;
      activationContext = context;
      let closed = false;
      return Promise.resolve({
        id: "transport",
        get closed() {
          return closed;
        },
        unsubscribe() {
          if (closed) return;
          closed = true;
          transportClosed += 1;
        }
      });
    }
  );
  const lifecycle = createDataSourceLifecycleController({
    adapterId: "adapter",
    reconnectPolicy: createExponentialReconnectPolicy({ enabled: false }),
    operations: {
      connect: vi.fn(() => Promise.resolve()),
      disconnect: vi.fn(() => Promise.resolve())
    }
  });
  const manager = createSubscriptionManager({
    adapterId: "adapter",
    lifecycle,
    transport: { activate }
  });
  return {
    lifecycle,
    manager,
    activate,
    get listener() {
      return transportListener;
    },
    get activationContext() {
      return activationContext;
    },
    get transportClosed() {
      return transportClosed;
    }
  };
}

describe("subscription manager", () => {
  it("defers activation, deduplicates consumers, and reference-counts cleanup", async () => {
    const test = harness();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const first = await test.manager.subscribe(request, firstListener);
    expect(first.state).toBe("pending");
    await test.lifecycle.connect();
    await Promise.resolve();
    const second = await test.manager.subscribe(
      { ...request, addresses: [{ sourceId: "source", key: "point" }] },
      secondListener
    );
    expect(test.activate).toHaveBeenCalledOnce();
    expect(first.state).toBe("active");
    const event = Object.freeze({ type: "STATUS" }) as unknown as DataSourceEvent;
    test.listener?.(event);
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
    await first.unsubscribe();
    await first.unsubscribe();
    expect(test.transportClosed).toBe(0);
    await second.unsubscribe();
    expect(test.transportClosed).toBe(1);
  });

  it("isolates listeners and restores intent with a new generation", async () => {
    const test = harness();
    const good = vi.fn();
    const diagnostics: string[] = [];
    await test.manager.dispose();

    const lifecycle = createDataSourceLifecycleController({
      adapterId: "adapter-2",
      reconnectPolicy: createExponentialReconnectPolicy({ enabled: false }),
      operations: {
        connect: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve())
      }
    });
    const listeners: DataSourceEventListener[] = [];
    const manager = createSubscriptionManager({
      adapterId: "adapter-2",
      lifecycle,
      onDiagnostic: ({ code }) => diagnostics.push(code),
      transport: {
        activate: vi.fn(
          (
            _request: Readonly<NormalizedSubscriptionRequest>,
            listener: DataSourceEventListener
          ) => {
            listeners.push(listener);
            return Promise.resolve({ id: "transport", closed: false, unsubscribe: vi.fn() });
          }
        )
      }
    });
    await lifecycle.connect();
    await manager.subscribe(request, () => {
      throw new Error("bad listener");
    });
    await manager.subscribe(request, good);
    listeners[0]?.(Object.freeze({ type: "STATUS" }) as unknown as DataSourceEvent);
    expect(good).toHaveBeenCalledOnce();
    expect(diagnostics).toContain("DATASOURCE_LISTENER_ERROR");
    const stale = listeners[0];
    await lifecycle.reconnect();
    await Promise.resolve();
    expect(listeners).toHaveLength(2);
    stale?.(Object.freeze({ type: "STATUS" }) as unknown as DataSourceEvent);
    expect(good).toHaveBeenCalledOnce();
    listeners[1]?.(Object.freeze({ type: "STATUS" }) as unknown as DataSourceEvent);
    expect(good).toHaveBeenCalledTimes(2);
    await manager.dispose();
    await expect(manager.subscribe(request, good)).rejects.toMatchObject({
      code: "DATASOURCE_DISPOSED"
    });
  });
});
