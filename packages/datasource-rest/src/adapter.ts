import {
  DataSourceError,
  SystemDataSourceScheduler,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  createSubscriptionManager,
  dataPointAddressKey,
  normalizeAddress,
  normalizeDataPointValue,
  validateReadRequest,
  validateWriteRequest,
  type BrowseRequest,
  type BrowseResult,
  type DataPointFailure,
  type DataPointValue,
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
  type WriteItemResult,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import type {
  HttpTransport,
  HttpTransportRequest,
  HttpTransportResponse,
  RestDataSource,
  RestDataSourceConfig,
  RestPointMapping
} from "./contracts.js";
import { extractPath, safeEndpoint, validateRestConfig } from "./validation.js";

const CAPABILITIES = (write: boolean): DataSourceCapabilities =>
  Object.freeze({
    connect: true,
    disconnect: true,
    subscribe: true,
    read: true,
    write,
    browse: true,
    batchRead: true,
    batchWrite: write,
    historyRead: false,
    metadata: true
  });

export function createRestDataSourceAdapter(
  config: Readonly<RestDataSourceConfig>
): RestDataSource {
  return new RestAdapter(config);
}

class RestAdapter implements RestDataSource {
  public readonly identity;
  public readonly capabilities;
  public readonly permissions: DataSourcePermissions;
  readonly #config: Readonly<RestDataSourceConfig>;
  readonly #scheduler;
  readonly #transport;
  readonly #mappings = new Map<string, Readonly<RestPointMapping>>();
  readonly #lifecycle;
  readonly #subscriptions;
  readonly #requests = new Set<AbortController>();
  #disposed = false;
  #nextSubscription = 1;

  public constructor(config: Readonly<RestDataSourceConfig>) {
    validateRestConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity });
    this.capabilities = CAPABILITIES(config.write !== undefined);
    this.permissions = Object.freeze({
      READ: true,
      WRITE: config.write !== undefined,
      SUBSCRIBE: true,
      BROWSE: true,
      HISTORY_READ: false
    });
    this.#scheduler = config.scheduler ?? new SystemDataSourceScheduler();
    this.#transport = config.transport ?? createFetchHttpTransport();
    for (const mapping of config.response.points)
      this.#mappings.set(dataPointAddressKey(mapping.address), Object.freeze({ ...mapping }));
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      scheduler: this.#scheduler,
      ...(config.reconnectPolicy ? { reconnectPolicy: config.reconnectPolicy } : {}),
      operations: {
        connect: async ({ signal }) => {
          await this.#config.authProvider?.resolve(
            {
              adapterId: this.identity.id,
              operation: "connect",
              endpoint: safeEndpoint(this.#config.endpoint.url)
            },
            signal
          );
        },
        disconnect: () => {
          this.#cancelRequests();
          return Promise.resolve();
        }
      }
    });
    this.#subscriptions = createSubscriptionManager({
      adapterId: this.identity.id,
      lifecycle: this.#lifecycle,
      now: () => this.#scheduler.now(),
      transport: {
        activate: (request, listener, context) => this.#activatePolling(request, listener, context)
      }
    });
  }

  public connect(): Promise<void> {
    this.#assertActive();
    return this.#lifecycle.connect();
  }
  public disconnect(): Promise<void> {
    this.#assertActive();
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
    if (!this.#config.polling)
      return Promise.reject(
        new DataSourceError("DATASOURCE_UNSUPPORTED_OPERATION", "REST polling is not configured.", {
          operation: "subscribe",
          adapterId: this.identity.id
        })
      );
    return this.#subscriptions.subscribe(request, listener);
  }
  public async read(request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    this.#requireConnected("read");
    assertOperationAllowed("read", this.capabilities, this.permissions);
    validateReadRequest(request);
    const known = request.addresses.filter((address) =>
      this.#mappings.has(dataPointAddressKey(address))
    );
    const failures: DataPointFailure[] = request.addresses
      .filter((address) => !this.#mappings.has(dataPointAddressKey(address)))
      .map((address) =>
        Object.freeze({
          address: normalizeAddress(address),
          error: this.#error(
            "DATASOURCE_READ_ERROR",
            "REST point mapping was not found.",
            "read",
            false
          ).toJSON()
        })
      );
    if (known.length === 0)
      return Object.freeze({ values: Object.freeze([]), failures: Object.freeze(failures) });
    try {
      const response = await this.#execute(
        this.#config.endpoint,
        "read",
        undefined,
        request.timeoutMs,
        request.correlationId
      );
      const mapped = this.#mapResponse(response, known);
      return Object.freeze({
        values: Object.freeze(mapped.values),
        failures: Object.freeze([...failures, ...mapped.failures])
      });
    } catch (cause) {
      const error = this.#normalizeError(cause, "read", request.correlationId);
      return Object.freeze({
        values: Object.freeze([]),
        failures: Object.freeze(
          known.map((address) =>
            Object.freeze({ address: normalizeAddress(address), error: error.toJSON() })
          )
        )
      });
    }
  }
  public async write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    this.#requireConnected("write");
    assertOperationAllowed("write", this.capabilities, this.permissions);
    validateWriteRequest(request);
    const endpoint = this.#config.write?.endpoint;
    if (!endpoint)
      throw new DataSourceError("DATASOURCE_UNSUPPORTED_OPERATION", "Write is disabled.");
    const results: WriteItemResult[] = [];
    const valid = request.items.filter((item) => {
      if (!this.#mappings.has(dataPointAddressKey(item.address))) {
        results.push(
          Object.freeze({
            ok: false,
            address: normalizeAddress(item.address),
            error: this.#error(
              "DATASOURCE_WRITE_ERROR",
              "REST point mapping was not found.",
              "write",
              false
            ).toJSON()
          })
        );
        return false;
      }
      return true;
    });
    if (valid.length > 0) {
      const body = JSON.stringify({
        items: valid.map((item) => ({ key: item.address.key, value: item.value }))
      });
      try {
        await this.#execute(endpoint, "write", body, request.timeoutMs, request.correlationId);
        for (const item of valid)
          results.push(Object.freeze({ ok: true, address: normalizeAddress(item.address) }));
      } catch (cause) {
        const error = this.#normalizeError(cause, "write", request.correlationId);
        for (const item of valid)
          results.push(
            Object.freeze({
              ok: false,
              address: normalizeAddress(item.address),
              error: error.toJSON()
            })
          );
      }
    }
    return Object.freeze({ results: Object.freeze(results) });
  }
  public async browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    await Promise.resolve();
    this.#requireConnected("browse");
    return Object.freeze({
      points: Object.freeze(
        [...this.#mappings.values()].map((mapping) =>
          Object.freeze({
            address: normalizeAddress(mapping.address),
            readable: true,
            writable: this.#config.write !== undefined,
            ...(mapping.expectedType ? { dataType: mapping.expectedType } : {}),
            ...(mapping.metadata ? { metadata: mapping.metadata } : {})
          })
        )
      )
    });
  }
  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelRequests();
    await this.#subscriptions.dispose();
    await this.#lifecycle.dispose();
  }

  async #activatePolling(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle> {
    await Promise.resolve();
    for (const address of request.addresses)
      if (!this.#mappings.has(dataPointAddressKey(address)))
        throw new DataSourceError(
          "DATASOURCE_SUBSCRIPTION_ERROR",
          "REST subscription contains an unknown point."
        );
    const id = `${this.identity.id}:poll:${this.#nextSubscription++}`;
    const state = { closed: false };
    let task: DataSourceScheduledTask | undefined;
    const interval = request.samplingIntervalMs ?? this.#config.polling?.intervalMs ?? 1_000;
    const isActive = (): boolean => !state.closed && !context.signal.aborted;
    const poll = async (): Promise<void> => {
      if (!isActive()) return;
      try {
        const response = await this.#execute(
          this.#config.endpoint,
          "subscribe",
          undefined,
          undefined,
          undefined,
          context.signal
        );
        if (!isActive()) return;
        const mapped = this.#mapResponse(response, request.addresses);
        for (const value of mapped.values) {
          const event: DataSourceEvent = Object.freeze({
            type: "VALUE",
            adapter: this.identity,
            timestamp: this.#scheduler.now(),
            ...(value.sequence === undefined ? {} : { sequence: value.sequence }),
            value
          });
          listener(event);
        }
      } catch (cause) {
        if (isActive())
          this.#diagnostic("DATASOURCE_REST_POLL_ERROR", "warning", "REST poll failed.");
        void cause;
      } finally {
        if (isActive()) task = this.#scheduler.schedule(interval, () => void poll());
      }
    };
    if (this.#config.polling?.emitImmediately === false)
      task = this.#scheduler.schedule(interval, () => void poll());
    else void poll();
    context.signal.addEventListener(
      "abort",
      () => {
        state.closed = true;
        task?.cancel();
      },
      { once: true }
    );
    return {
      id,
      get closed() {
        return state.closed;
      },
      unsubscribe: () => {
        state.closed = true;
        task?.cancel();
      }
    };
  }

  async #execute(
    endpoint: RestDataSourceConfig["endpoint"],
    operation: "read" | "write" | "subscribe",
    body?: string,
    timeoutOverride?: number,
    correlationId?: string,
    externalSignal?: AbortSignal
  ): Promise<Readonly<HttpTransportResponse>> {
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort();
    };
    externalSignal?.addEventListener("abort", cancel, { once: true });
    this.#requests.add(controller);
    const timeoutMs = timeoutOverride ?? endpoint.timeoutMs ?? 10_000;
    const timeout = this.#scheduler.schedule(timeoutMs, () => {
      controller.abort();
    });
    try {
      const auth = await this.#config.authProvider?.resolve(
        {
          adapterId: this.identity.id,
          operation,
          endpoint: safeEndpoint(endpoint.url)
        },
        controller.signal
      );
      const headers = Object.freeze({
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(endpoint.headers ?? {}),
        ...(auth?.headers ?? {})
      });
      const response = await this.#transport.execute(
        Object.freeze({
          url: endpoint.url,
          method: endpoint.method ?? (body === undefined ? "GET" : "POST"),
          headers,
          ...(body === undefined ? {} : { body })
        }),
        controller.signal
      );
      if (response.body.length > (this.#config.limits?.responseBytes ?? 1_048_576))
        throw this.#error(
          "DATASOURCE_PARSE_ERROR",
          "REST response exceeds the size limit.",
          operation
        );
      if (body && body.length > (this.#config.limits?.requestBytes ?? 262_144))
        throw this.#error(
          "DATASOURCE_WRITE_ERROR",
          "REST request exceeds the size limit.",
          operation
        );
      if (response.status < 200 || response.status >= 300)
        throw this.#httpError(response.status, operation, correlationId);
      return response;
    } catch (cause) {
      if (controller.signal.aborted)
        throw this.#error(
          "DATASOURCE_TIMEOUT",
          "REST request timed out or was cancelled.",
          operation,
          true,
          correlationId
        );
      throw cause;
    } finally {
      timeout.cancel();
      externalSignal?.removeEventListener("abort", cancel);
      this.#requests.delete(controller);
    }
  }

  #mapResponse(
    response: Readonly<HttpTransportResponse>,
    addresses: readonly Readonly<{ sourceId: string; key: string }>[]
  ): { values: DataPointValue[]; failures: DataPointFailure[] } {
    let payload: unknown;
    try {
      payload = response.body === "" ? null : JSON.parse(response.body);
    } catch {
      throw this.#error(
        "DATASOURCE_PARSE_ERROR",
        "REST response is not valid JSON.",
        "read",
        false
      );
    }
    const values: DataPointValue[] = [];
    const failures: DataPointFailure[] = [];
    for (const address of addresses) {
      const mapping = this.#mappings.get(dataPointAddressKey(address));
      if (!mapping) continue;
      try {
        const raw = extractPath(payload, mapping.path);
        if (raw === undefined) throw new Error("missing");
        if (mapping.expectedType && jsonType(raw) !== mapping.expectedType) throw new Error("type");
        values.push(
          normalizeDataPointValue(
            {
              address: mapping.address,
              value: raw,
              quality: mapping.qualityPath ? extractPath(payload, mapping.qualityPath) : "GOOD",
              sourceTimestamp: mapping.timestampPath
                ? extractPath(payload, mapping.timestampPath)
                : this.#config.response.timestampPath
                  ? extractPath(payload, this.#config.response.timestampPath)
                  : undefined,
              sequence: mapping.sequencePath
                ? extractPath(payload, mapping.sequencePath)
                : undefined,
              metadata: mapping.metadata
            },
            { receivedTimestamp: this.#scheduler.now() }
          )
        );
      } catch {
        failures.push(
          Object.freeze({
            address: normalizeAddress(mapping.address),
            error: this.#error(
              "DATASOURCE_NORMALIZATION_ERROR",
              "REST point could not be extracted or normalized.",
              "read",
              false
            ).toJSON()
          })
        );
      }
    }
    return { values, failures };
  }

  #httpError(
    status: number,
    operation: "read" | "write" | "subscribe",
    correlationId?: string
  ): DataSourceError {
    const access = status === 401 || status === 403;
    return this.#error(
      access ? "DATASOURCE_ACCESS_DENIED" : "DATASOURCE_READ_ERROR",
      access
        ? "REST server rejected authentication or authorization."
        : status === 429
          ? "REST server rate limited the request."
          : "REST server returned an unsuccessful status.",
      operation,
      status === 408 || status === 429 || status >= 500,
      correlationId,
      status
    );
  }
  #normalizeError(
    cause: unknown,
    operation: "read" | "write",
    correlationId?: string
  ): DataSourceError {
    return cause instanceof DataSourceError
      ? cause
      : this.#error(
          operation === "read" ? "DATASOURCE_READ_ERROR" : "DATASOURCE_WRITE_ERROR",
          `REST ${operation} failed.`,
          operation,
          true,
          correlationId
        );
  }
  #error(
    code: ConstructorParameters<typeof DataSourceError>[0],
    message: string,
    operation: "read" | "write" | "subscribe",
    recoverable = false,
    correlationId?: string,
    status?: number
  ): DataSourceError {
    return new DataSourceError(code, message, {
      operation,
      adapterId: this.identity.id,
      recoverable,
      timestamp: this.#scheduler.now(),
      ...(correlationId ? { correlationId } : {}),
      context: {
        endpoint: safeEndpoint(
          operation === "write"
            ? (this.#config.write?.endpoint.url ?? this.#config.endpoint.url)
            : this.#config.endpoint.url
        ),
        ...(status === undefined ? {} : { httpStatus: status })
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
          endpoint: safeEndpoint(this.#config.endpoint.url)
        })
      );
    } catch {
      // Diagnostic sinks never own adapter behavior.
    }
  }
  #cancelRequests(): void {
    for (const request of this.#requests) request.abort();
    this.#requests.clear();
  }
  #assertActive(): void {
    if (this.#disposed)
      throw new DataSourceError("DATASOURCE_DISPOSED", "REST adapter is disposed.", {
        adapterId: this.identity.id
      });
  }
  #requireConnected(operation: "read" | "write" | "browse"): void {
    this.#assertActive();
    if (this.#lifecycle.status.state !== "connected")
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "REST adapter is not connected.", {
        operation,
        adapterId: this.identity.id
      });
  }
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function createFetchHttpTransport(fetcher: typeof fetch = globalThis.fetch): HttpTransport {
  if (typeof fetcher !== "function")
    throw new DataSourceError(
      "DATASOURCE_CONFIGURATION_ERROR",
      "No Fetch implementation is available; inject an HTTP transport."
    );
  return Object.freeze({
    async execute(
      request: Readonly<HttpTransportRequest>,
      signal?: AbortSignal
    ): Promise<Readonly<HttpTransportResponse>> {
      const response = await fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(signal === undefined ? {} : { signal })
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return Object.freeze({
        status: response.status,
        headers: Object.freeze(headers),
        body: await response.text()
      });
    }
  });
}
