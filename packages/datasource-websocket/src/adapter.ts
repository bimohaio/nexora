import {
  DataSourceError,
  SystemDataSourceScheduler,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  createSubscriptionManager,
  normalizeDataPointValue,
  type BrowseRequest,
  type BrowseResult,
  type DataSourceCapabilities,
  type DataSourceEvent,
  type DataSourceEventListener,
  type DataSourcePermissions,
  type DataSourceScheduledTask,
  type DataSourceStatus,
  type ManagedSubscriptionHandle,
  type NormalizedSubscriptionRequest,
  type ReadRequest,
  type ReadResult,
  type SubscriptionActivationContext,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import type {
  WebSocketDataSource,
  WebSocketDataSourceConfig,
  WebSocketTransport,
  WebSocketTransportFactory
} from "./contracts.js";
import {
  extractWebSocketPath,
  safeWebSocketEndpoint,
  validateWebSocketConfig
} from "./validation.js";

const CAPABILITIES: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: false,
  write: false,
  browse: false,
  batchRead: false,
  batchWrite: false,
  historyRead: false,
  metadata: true
});

interface LocalSubscription {
  readonly id: string;
  readonly request: Readonly<NormalizedSubscriptionRequest>;
  readonly listener: DataSourceEventListener;
  readonly generation: number;
  closed: boolean;
}

export function createWebSocketDataSourceAdapter(
  config: Readonly<WebSocketDataSourceConfig>
): WebSocketDataSource {
  return new WebSocketAdapter(config);
}

class WebSocketAdapter implements WebSocketDataSource {
  public readonly identity;
  public readonly capabilities = CAPABILITIES;
  public readonly permissions: DataSourcePermissions = Object.freeze({
    READ: false,
    WRITE: false,
    SUBSCRIBE: true,
    BROWSE: false,
    HISTORY_READ: false
  });
  readonly #config: Readonly<WebSocketDataSourceConfig>;
  readonly #scheduler;
  readonly #factory;
  readonly #lifecycle;
  readonly #subscriptions;
  readonly #local = new Map<string, LocalSubscription>();
  #socket: WebSocketTransport | undefined;
  #socketGeneration = -1;
  #heartbeatTask: DataSourceScheduledTask | undefined;
  #heartbeatTimeout: DataSourceScheduledTask | undefined;
  #heartbeatSatisfied = true;
  #processing = false;
  readonly #queue: string[] = [];
  #nextSubscription = 1;
  #disposed = false;
  #explicitClose = false;

  public constructor(config: Readonly<WebSocketDataSourceConfig>) {
    validateWebSocketConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity });
    this.#scheduler = config.scheduler ?? new SystemDataSourceScheduler();
    this.#factory = config.transportFactory ?? createBrowserWebSocketTransportFactory();
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      scheduler: this.#scheduler,
      connectTimeoutMs: config.endpoint.connectTimeoutMs ?? 10_000,
      ...(config.reconnectPolicy ? { reconnectPolicy: config.reconnectPolicy } : {}),
      operations: {
        connect: (context) => this.#open(context.generation, context.signal),
        disconnect: () => {
          this.#closeSocket();
          return Promise.resolve();
        }
      }
    });
    this.#subscriptions = createSubscriptionManager({
      adapterId: this.identity.id,
      lifecycle: this.#lifecycle,
      now: () => this.#scheduler.now(),
      transport: {
        activate: (request, listener, context) =>
          this.#activateSubscription(request, listener, context)
      }
    });
  }

  public connect(): Promise<void> {
    this.#assertActive();
    this.#explicitClose = false;
    return this.#lifecycle.connect();
  }
  public disconnect(): Promise<void> {
    this.#assertActive();
    this.#explicitClose = true;
    return this.#lifecycle.disconnect();
  }
  public getStatus(): Readonly<DataSourceStatus> {
    const status = this.#lifecycle.status;
    return Object.freeze({
      state: status.state,
      changedAt: status.changedAt,
      attempt: status.attempt,
      ...(status.lastError
        ? {
            diagnostic: Object.freeze({
              code: "DATASOURCE_VALIDATION_ERROR" as const,
              severity: "error" as const,
              message: status.lastError.message,
              timestamp: status.changedAt
            })
          }
        : {})
    });
  }
  public subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle> {
    this.#assertActive();
    assertOperationAllowed("subscribe", this.capabilities, this.permissions);
    return this.#subscriptions.subscribe(request, listener);
  }
  public read(_request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    assertOperationAllowed("read", this.capabilities, this.permissions);
    return Promise.resolve(
      Object.freeze({ values: Object.freeze([]), failures: Object.freeze([]) })
    );
  }
  public write(_request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    assertOperationAllowed("write", this.capabilities, this.permissions);
    return Promise.resolve(Object.freeze({ results: Object.freeze([]) }));
  }
  public browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    assertOperationAllowed("browse", this.capabilities, this.permissions);
    return Promise.resolve(Object.freeze({ points: Object.freeze([]) }));
  }
  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#explicitClose = true;
    this.#clearHeartbeat();
    this.#queue.length = 0;
    await this.#subscriptions.dispose();
    await this.#lifecycle.dispose();
    this.#closeSocket();
  }

  async #open(generation: number, signal: AbortSignal): Promise<void> {
    const auth = await this.#config.authProvider?.resolve(
      {
        adapterId: this.identity.id,
        endpoint: safeWebSocketEndpoint(this.#config.endpoint.url)
      },
      signal
    );
    if (signal.aborted) throw this.#connectionError("WebSocket connection was cancelled.");
    return new Promise<void>((resolve, reject) => {
      const socket = this.#factory.connect({
        url: this.#config.endpoint.url,
        protocols: Object.freeze([
          ...(this.#config.endpoint.protocols ?? []),
          ...(auth?.protocols ?? [])
        ])
      });
      this.#socket = socket;
      this.#socketGeneration = generation;
      let settled = false;
      const authoritative = (): boolean =>
        !this.#disposed &&
        this.#socket === socket &&
        this.#socketGeneration === generation &&
        !signal.aborted;
      socket.setHandlers({
        open: () => {
          if (!authoritative()) return;
          settled = true;
          this.#diagnostic("DATASOURCE_WEBSOCKET_OPENED", "info", "WebSocket opened.");
          this.#startHeartbeat(generation);
          resolve();
        },
        message: (data) => {
          if (!authoritative()) return;
          this.#enqueue(data);
        },
        close: ({ code }) => {
          if (!authoritative()) return;
          this.#clearHeartbeat();
          this.#socket = undefined;
          if (!settled) {
            settled = true;
            reject(this.#connectionError("WebSocket closed before opening.", code));
          } else if (!this.#explicitClose)
            this.#lifecycle.connectionLost(
              this.#connectionError("WebSocket closed unexpectedly.", code),
              generation
            );
        },
        error: () => {
          if (!authoritative()) return;
          if (!settled) {
            settled = true;
            reject(this.#connectionError("WebSocket connection failed."));
          }
        }
      });
      signal.addEventListener(
        "abort",
        () => {
          if (this.#socket === socket) {
            socket.clearHandlers();
            socket.close(1000, "cancelled");
            this.#socket = undefined;
          }
          if (!settled) {
            settled = true;
            reject(this.#connectionError("WebSocket connection was cancelled."));
          }
        },
        { once: true }
      );
    });
  }

  async #activateSubscription(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle> {
    await Promise.resolve();
    if (!this.#socket?.open)
      throw new DataSourceError("DATASOURCE_SUBSCRIPTION_ERROR", "WebSocket is not open.", {
        adapterId: this.identity.id
      });
    const id = `${this.identity.id}:socket-subscription:${this.#nextSubscription++}`;
    const subscription: LocalSubscription = {
      id,
      request,
      listener,
      generation: context.generation,
      closed: false
    };
    this.#local.set(id, subscription);
    if (this.#config.commands?.subscribeType)
      this.#send({
        type: this.#config.commands.subscribeType,
        subscriptionId: id,
        points: request.addresses.map((address) => address.key)
      });
    context.signal.addEventListener(
      "abort",
      () => {
        subscription.closed = true;
        this.#local.delete(id);
      },
      { once: true }
    );
    return {
      id,
      get closed() {
        return subscription.closed;
      },
      unsubscribe: () => {
        if (subscription.closed) return;
        subscription.closed = true;
        this.#local.delete(id);
        if (this.#config.commands?.unsubscribeType && this.#socket?.open)
          this.#send({ type: this.#config.commands.unsubscribeType, subscriptionId: id });
      }
    };
  }

  #enqueue(data: string | ArrayBuffer): void {
    if (typeof data !== "string") {
      this.#diagnostic(
        "DATASOURCE_WEBSOCKET_MESSAGE_REJECTED",
        "warning",
        "Binary WebSocket messages are unsupported."
      );
      return;
    }
    if (
      new TextEncoder().encode(data).byteLength > (this.#config.limits?.messageBytes ?? 1_048_576)
    ) {
      this.#diagnostic(
        "DATASOURCE_WEBSOCKET_MESSAGE_REJECTED",
        "warning",
        "WebSocket message exceeds the size limit."
      );
      return;
    }
    const limit = this.#config.limits?.inboundQueue ?? 100;
    if (this.#queue.length >= limit) {
      this.#diagnostic(
        "DATASOURCE_WEBSOCKET_BACKPRESSURE",
        "error",
        "WebSocket inbound queue limit was reached."
      );
      this.#lifecycle.connectionLost(
        this.#connectionError("WebSocket inbound queue limit was reached."),
        this.#socketGeneration
      );
      return;
    }
    this.#queue.push(data);
    if (!this.#processing) void this.#processQueue();
  }

  async #processQueue(): Promise<void> {
    this.#processing = true;
    while (this.#queue.length > 0 && !this.#disposed) {
      const raw = this.#queue.shift();
      await Promise.resolve();
      if (raw !== undefined) this.#processMessage(raw);
    }
    this.#processing = false;
  }

  #processMessage(raw: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.#diagnostic(
        "DATASOURCE_WEBSOCKET_MESSAGE_REJECTED",
        "warning",
        "WebSocket message is not valid JSON."
      );
      return;
    }
    if (this.#isHeartbeat(payload)) {
      this.#heartbeatSatisfied = true;
      this.#heartbeatTimeout?.cancel();
      this.#heartbeatTimeout = undefined;
      return;
    }
    const mapping = this.#config.mapping;
    if (
      mapping.discriminatorPath &&
      !sameJson(
        extractWebSocketPath(payload, mapping.discriminatorPath),
        mapping.discriminatorValue
      )
    )
      return;
    const extracted = mapping.batchPath
      ? extractWebSocketPath(payload, mapping.batchPath)
      : [payload];
    if (!Array.isArray(extracted)) {
      this.#rejectMapping();
      return;
    }
    const maximum = this.#config.limits?.batchItems ?? 1_000;
    if (extracted.length > maximum) {
      this.#rejectMapping();
      return;
    }
    for (const item of extracted) {
      try {
        const key = extractWebSocketPath(item, mapping.keyPath);
        const value = extractWebSocketPath(item, mapping.valuePath);
        if (typeof key !== "string" || key === "" || value === undefined)
          throw new Error("invalid mapping");
        for (const subscription of this.#local.values()) {
          if (subscription.closed || subscription.generation !== this.#lifecycle.status.generation)
            continue;
          const address = subscription.request.addresses.find((candidate) => candidate.key === key);
          if (!address) continue;
          const normalized = normalizeDataPointValue(
            {
              address,
              value,
              quality: mapping.qualityPath
                ? extractWebSocketPath(item, mapping.qualityPath)
                : "GOOD",
              sourceTimestamp: mapping.timestampPath
                ? extractWebSocketPath(item, mapping.timestampPath)
                : undefined,
              sequence: mapping.sequencePath
                ? extractWebSocketPath(item, mapping.sequencePath)
                : undefined,
              metadata: mapping.metadataPath
                ? extractWebSocketPath(item, mapping.metadataPath)
                : this.#config.metadata
            },
            { receivedTimestamp: this.#scheduler.now() }
          );
          const event: DataSourceEvent = Object.freeze({
            type: "VALUE",
            adapter: this.identity,
            timestamp: this.#scheduler.now(),
            ...(normalized.sequence === undefined ? {} : { sequence: normalized.sequence }),
            value: normalized
          });
          subscription.listener(event);
        }
      } catch {
        this.#rejectMapping();
      }
    }
  }

  #startHeartbeat(generation: number): void {
    const heartbeat = this.#config.heartbeat;
    if (!heartbeat) return;
    const tick = (): void => {
      if (
        this.#disposed ||
        this.#socketGeneration !== generation ||
        this.#lifecycle.status.generation !== generation ||
        !this.#socket?.open
      )
        return;
      this.#heartbeatSatisfied = heartbeat.responsePath === undefined;
      this.#send(heartbeat.message);
      if (!this.#heartbeatSatisfied)
        this.#heartbeatTimeout = this.#scheduler.schedule(heartbeat.timeoutMs, () => {
          if (
            !this.#heartbeatSatisfied &&
            this.#socketGeneration === generation &&
            !this.#explicitClose
          )
            this.#lifecycle.connectionLost(
              this.#connectionError("WebSocket heartbeat timed out."),
              generation
            );
        });
      this.#heartbeatTask = this.#scheduler.schedule(heartbeat.intervalMs, tick);
    };
    this.#heartbeatTask = this.#scheduler.schedule(heartbeat.intervalMs, tick);
  }
  #isHeartbeat(payload: unknown): boolean {
    const heartbeat = this.#config.heartbeat;
    return (
      heartbeat?.responsePath !== undefined &&
      sameJson(extractWebSocketPath(payload, heartbeat.responsePath), heartbeat.responseValue)
    );
  }
  #clearHeartbeat(): void {
    this.#heartbeatTask?.cancel();
    this.#heartbeatTimeout?.cancel();
    this.#heartbeatTask = undefined;
    this.#heartbeatTimeout = undefined;
  }
  #send(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    if (serialized.length > (this.#config.limits?.messageBytes ?? 1_048_576))
      throw new DataSourceError(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "WebSocket outbound message exceeds the size limit."
      );
    this.#socket?.send(serialized);
  }
  #closeSocket(): void {
    this.#clearHeartbeat();
    const socket = this.#socket;
    this.#socket = undefined;
    this.#socketGeneration = -1;
    if (socket) {
      socket.clearHandlers();
      socket.close(1000, "normal");
    }
    this.#local.clear();
  }
  #rejectMapping(): void {
    this.#diagnostic(
      "DATASOURCE_WEBSOCKET_MESSAGE_REJECTED",
      "warning",
      "WebSocket message did not match the configured mapping."
    );
  }
  #connectionError(message: string, closeCode?: number): DataSourceError {
    return new DataSourceError("DATASOURCE_CONNECTION_ERROR", message, {
      adapterId: this.identity.id,
      operation: "connect",
      recoverable: closeCode !== 1008 && closeCode !== 4001,
      timestamp: this.#scheduler.now(),
      context: {
        endpoint: safeWebSocketEndpoint(this.#config.endpoint.url),
        ...(closeCode === undefined ? {} : { closeCode })
      }
    });
  }
  #diagnostic(code: string, severity: "info" | "warning" | "error", message: string): void {
    try {
      this.#config.onDiagnostic?.(
        Object.freeze({
          code,
          severity,
          message,
          timestamp: this.#scheduler.now(),
          endpoint: safeWebSocketEndpoint(this.#config.endpoint.url)
        })
      );
    } catch {
      // Diagnostics do not affect transport authority.
    }
  }
  #assertActive(): void {
    if (this.#disposed)
      throw new DataSourceError("DATASOURCE_DISPOSED", "WebSocket adapter is disposed.", {
        adapterId: this.identity.id
      });
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createBrowserWebSocketTransportFactory(
  Constructor?: BrowserWebSocketConstructor
): WebSocketTransportFactory {
  const BrowserConstructor =
    Constructor ?? (globalThis as unknown as { WebSocket?: BrowserWebSocketConstructor }).WebSocket;
  if (typeof BrowserConstructor !== "function")
    throw new DataSourceError(
      "DATASOURCE_CONFIGURATION_ERROR",
      "No WebSocket implementation is available; inject a transport factory."
    );
  return Object.freeze({
    connect(options: { readonly url: string; readonly protocols: readonly string[] }) {
      const native = new BrowserConstructor(options.url, [...options.protocols]);
      let handlers: Parameters<WebSocketTransport["setHandlers"]>[0] | undefined;
      native.onopen = () => handlers?.open();
      native.onmessage = (event: { readonly data: unknown }) => {
        if (typeof event.data === "string" || event.data instanceof ArrayBuffer)
          handlers?.message(event.data);
        else handlers?.error(new Error("Unsupported WebSocket message type."));
      };
      native.onclose = (event: { readonly code: number; readonly reason: string }) =>
        handlers?.close({ code: event.code, reason: event.reason });
      native.onerror = (event: unknown) => handlers?.error(event);
      return {
        get open() {
          return native.readyState === BrowserConstructor.OPEN;
        },
        send: (data: string) => {
          native.send(data);
        },
        close: (code?: number, reason?: string) => {
          native.close(code, reason);
        },
        setHandlers: (next: Parameters<WebSocketTransport["setHandlers"]>[0]) => {
          handlers = next;
        },
        clearHandlers: () => {
          handlers = undefined;
          native.onopen = null;
          native.onmessage = null;
          native.onclose = null;
          native.onerror = null;
        }
      };
    }
  });
}

interface BrowserWebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface BrowserWebSocketConstructor {
  readonly OPEN: number;
  new (url: string, protocols?: string[]): BrowserWebSocketLike;
}
