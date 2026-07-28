import type { JsonValue } from "@web-scada/core";
import {
  DataSourceError,
  SystemDataSourceScheduler,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  createSubscriptionManager,
  dataPointAddressKey,
  normalizeAddress,
  normalizeDataPointValue,
  normalizeJsonValue,
  validateReadRequest,
  validateWriteRequest,
  type BrowseRequest,
  type BrowseResult,
  type DataPointAddress,
  type DataPointFailure,
  type DataPointValue,
  type DataQuality,
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
  type SerializedDataSourceError,
  type StatusSubscription,
  type WriteItemResult,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import type {
  SimulatorControl,
  SimulatorDataSource,
  SimulatorDataSourceConfig,
  SimulatorPointDefinition,
  SimulatorPointSnapshot
} from "./contracts.js";
import { createSeededRandom, nextGeneratedValue } from "./generators.js";
import { matchesType, validateSimulatorConfig } from "./validation.js";

interface PointState {
  readonly definition: Readonly<SimulatorPointDefinition>;
  value: JsonValue;
  quality: DataQuality;
  sequence: number;
  sourceTimestamp: number;
  startedAt: number;
  tick: number;
  random: () => number;
  task: DataSourceScheduledTask | undefined;
}

interface Transport {
  readonly id: string;
  readonly request: Readonly<NormalizedSubscriptionRequest>;
  readonly listener: DataSourceEventListener;
  readonly generation: number;
  readonly lastPublished: Map<string, number>;
  initialTask: DataSourceScheduledTask | undefined;
  closed: boolean;
}

const CAPABILITIES: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: true,
  write: true,
  browse: true,
  batchRead: true,
  batchWrite: true,
  historyRead: false,
  metadata: true
});

export function createSimulatorDataSource(
  config: Readonly<SimulatorDataSourceConfig>
): SimulatorDataSource {
  return new SimulatorAdapter(config);
}

class SimulatorAdapter implements SimulatorDataSource {
  public readonly identity;
  public readonly capabilities = CAPABILITIES;
  public readonly permissions: DataSourcePermissions;
  public readonly control: SimulatorControl;
  readonly #config: Readonly<SimulatorDataSourceConfig>;
  readonly #scheduler;
  readonly #points = new Map<string, PointState>();
  readonly #transports = new Map<string, Transport>();
  readonly #lifecycle;
  readonly #lifecycleSchedulingSubscription: StatusSubscription;
  readonly #subscriptions;
  #nextTransportId = 1;
  #remainingFailures: number;
  #paused = false;
  #disposed = false;

  public constructor(config: Readonly<SimulatorDataSourceConfig>) {
    validateSimulatorConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity });
    this.#scheduler = config.scheduler ?? new SystemDataSourceScheduler();
    this.#remainingFailures = config.connectionFailures ?? 0;
    const write = config.points.some((point) => point.writable === true);
    this.permissions = Object.freeze({
      READ: true,
      WRITE: write,
      SUBSCRIBE: true,
      BROWSE: true,
      HISTORY_READ: false
    });
    for (const [index, definition] of config.points.entries()) {
      const address = normalizeAddress(definition.address);
      const normalized = Object.freeze({ ...definition, address });
      const now = this.#scheduler.now();
      this.#points.set(dataPointAddressKey(address), {
        definition: normalized,
        value: normalizeJsonValue(definition.initialValue),
        quality: Object.freeze({ ...(definition.quality ?? { level: "GOOD", reason: "GOOD" }) }),
        sequence: 0,
        sourceTimestamp: now,
        startedAt: now,
        tick: 0,
        random: createSeededRandom(definition.seed ?? (config.seed ?? 1) + index),
        task: undefined
      });
    }
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      scheduler: this.#scheduler,
      ...(config.reconnectPolicy === undefined ? {} : { reconnectPolicy: config.reconnectPolicy }),
      operations: {
        connect: async ({ signal }) => {
          const connectionDelayMs = this.#config.connectionDelayMs;
          if (connectionDelayMs !== undefined && connectionDelayMs > 0)
            await this.#delay(connectionDelayMs, signal);
          if (this.#remainingFailures > 0) {
            this.#remainingFailures -= 1;
            throw new DataSourceError(
              "DATASOURCE_CONNECTION_ERROR",
              "Simulated connection attempt failed.",
              { recoverable: true }
            );
          }
        },
        disconnect: () => {
          this.#cancelPointTasks();
          return Promise.resolve();
        }
      }
    });
    this.#subscriptions = createSubscriptionManager({
      adapterId: this.identity.id,
      lifecycle: this.#lifecycle,
      now: () => this.#scheduler.now(),
      transport: {
        activate: async (request, listener, context) =>
          this.#activateTransport(request, listener, context)
      }
    });
    this.#lifecycleSchedulingSubscription = this.#lifecycle.subscribeStatus((status) => {
      if (status.state === "connected") {
        for (const point of this.#points.values()) {
          point.startedAt = this.#scheduler.now();
          this.#schedulePoint(point);
        }
      } else if (status.state !== "connecting" && status.state !== "reconnecting") {
        this.#cancelPointTasks();
      }
    }, false);
    this.control = Object.freeze({
      pause: () => {
        this.#paused = true;
        this.#cancelPointTasks();
      },
      resume: () => {
        if (!this.#paused) return;
        this.#paused = false;
        if (this.#lifecycle.status.state === "connected")
          for (const point of this.#points.values()) this.#schedulePoint(point);
      },
      reset: () => {
        this.#reset();
      },
      failNextConnections: (count = 1) => {
        if (!Number.isSafeInteger(count) || count < 0)
          throw new DataSourceError(
            "DATASOURCE_CONFIGURATION_ERROR",
            "Connection failure count must be a non-negative safe integer."
          );
        this.#remainingFailures = count;
      },
      simulateConnectionLoss: (error?: unknown) => {
        this.#cancelPointTasks();
        this.#lifecycle.connectionLost(error);
      },
      setQuality: (address: DataPointAddress, quality: DataQuality) => {
        const point = this.#requirePoint(address);
        point.quality = Object.freeze({ ...quality });
        this.#updatePoint(point, point.value);
      },
      getPoint: (address: DataPointAddress) => {
        const point = this.#points.get(dataPointAddressKey(normalizeAddress(address)));
        return point === undefined ? undefined : this.#snapshot(point);
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
      ...(status.lastError === undefined
        ? {}
        : {
            diagnostic: Object.freeze({
              code: "DATASOURCE_VALIDATION_ERROR" as const,
              severity: "error" as const,
              message: status.lastError.message,
              timestamp: status.changedAt
            })
          })
    });
  }
  public subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle> {
    assertOperationAllowed("subscribe", this.capabilities, this.permissions);
    this.#assertActive();
    return this.#subscriptions.subscribe(request, listener);
  }
  public async read(request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    await Promise.resolve();
    this.#requireConnected("read");
    assertOperationAllowed("read", this.capabilities, this.permissions);
    validateReadRequest(request);
    const values: DataPointValue[] = [];
    const failures: DataPointFailure[] = [];
    for (const address of request.addresses) {
      const point = this.#points.get(dataPointAddressKey(normalizeAddress(address)));
      if (!point || point.definition.readable === false) {
        failures.push(
          Object.freeze({
            address: normalizeAddress(address),
            error: this.#error("DATASOURCE_READ_ERROR", "Simulator point is unavailable.", address)
          })
        );
      } else values.push(this.#value(point));
    }
    return Object.freeze({ values: Object.freeze(values), failures: Object.freeze(failures) });
  }
  public async write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    await Promise.resolve();
    this.#requireConnected("write");
    assertOperationAllowed("write", this.capabilities, this.permissions);
    validateWriteRequest(request);
    const results: WriteItemResult[] = [];
    for (const item of request.items) {
      const point = this.#points.get(dataPointAddressKey(normalizeAddress(item.address)));
      const allowed =
        point?.definition.writable === true &&
        (this.#config.writePolicy === "writable-points" ||
          point.definition.generator.type === "manual");
      if (!point || !allowed || !matchesType(item.value, point.definition.dataType)) {
        results.push(
          Object.freeze({
            ok: false,
            address: normalizeAddress(item.address),
            error: this.#error(
              "DATASOURCE_WRITE_ERROR",
              !point
                ? "Simulator point was not found."
                : !allowed
                  ? "Simulator point is not writable under the configured policy."
                  : "Write value does not match the point data type.",
              item.address
            )
          })
        );
        continue;
      }
      this.#updatePoint(point, normalizeJsonValue(item.value), item.sourceTimestamp);
      results.push(Object.freeze({ ok: true, address: point.definition.address }));
    }
    return Object.freeze({ results: Object.freeze(results) });
  }
  public async browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    await Promise.resolve();
    this.#requireConnected("browse");
    assertOperationAllowed("browse", this.capabilities, this.permissions);
    return Object.freeze({
      points: Object.freeze(
        [...this.#points.values()].map(({ definition }) =>
          Object.freeze({
            address: definition.address,
            dataType: definition.dataType,
            readable: definition.readable !== false,
            writable: definition.writable === true,
            ...(definition.displayName === undefined
              ? {}
              : { displayName: definition.displayName }),
            ...(definition.unit === undefined ? {} : { engineeringUnit: definition.unit }),
            ...(definition.minimum === undefined ? {} : { minimum: definition.minimum }),
            ...(definition.maximum === undefined ? {} : { maximum: definition.maximum }),
            ...(definition.metadata === undefined ? {} : { metadata: definition.metadata })
          })
        )
      )
    });
  }
  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelPointTasks();
    this.#lifecycleSchedulingSubscription.unsubscribe();
    await this.#subscriptions.dispose();
    await this.#lifecycle.dispose();
    this.#transports.clear();
  }

  async #activateTransport(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle> {
    await Promise.resolve();
    for (const address of request.addresses)
      if (!this.#points.has(dataPointAddressKey(address)))
        throw new DataSourceError(
          "DATASOURCE_SUBSCRIPTION_ERROR",
          `Unknown simulator point '${address.key}'.`
        );
    const id = `${this.identity.id}:transport:${this.#nextTransportId++}`;
    const transport: Transport = {
      id,
      request,
      listener,
      generation: context.generation,
      lastPublished: new Map(),
      initialTask: undefined,
      closed: false
    };
    this.#transports.set(id, transport);
    if (this.#config.emitInitialValue !== false && !context.signal.aborted)
      transport.initialTask = this.#scheduler.schedule(0, () => {
        transport.initialTask = undefined;
        for (const address of request.addresses) {
          const point = this.#points.get(dataPointAddressKey(address));
          if (point) this.#deliver(transport, point, true);
        }
      });
    return {
      id,
      get closed() {
        return transport.closed;
      },
      unsubscribe: () => {
        transport.closed = true;
        transport.initialTask?.cancel();
        transport.initialTask = undefined;
        this.#transports.delete(id);
      }
    };
  }

  #schedulePoint(point: PointState): void {
    if (
      this.#paused ||
      point.definition.generator.type === "manual" ||
      point.definition.generator.type === "constant" ||
      point.task !== undefined ||
      this.#lifecycle.status.state !== "connected"
    )
      return;
    const interval = point.definition.updateIntervalMs ?? 1_000;
    const generation = this.#lifecycle.status.generation;
    point.task = this.#scheduler.schedule(interval, () => {
      point.task = undefined;
      if (
        this.#disposed ||
        this.#paused ||
        this.#lifecycle.status.state !== "connected" ||
        this.#lifecycle.status.generation !== generation
      )
        return;
      point.tick += 1;
      try {
        const value = nextGeneratedValue(point.definition.generator, point.value, {
          now: this.#scheduler.now(),
          elapsedMs: this.#scheduler.now() - point.startedAt,
          tick: point.tick,
          random: point.random
        });
        this.#updatePoint(point, value);
      } catch {
        point.quality = Object.freeze({ level: "BAD", reason: "CONFIGURATION_ERROR" });
        this.#updatePoint(point, point.value);
      }
      this.#schedulePoint(point);
    });
  }

  #updatePoint(point: PointState, value: JsonValue, timestamp = this.#scheduler.now()): void {
    point.value = value;
    point.sequence += 1;
    point.sourceTimestamp = timestamp;
    for (const transport of this.#transports.values()) this.#deliver(transport, point, false);
  }
  #deliver(transport: Transport, point: PointState, initial: boolean): void {
    if (
      transport.closed ||
      transport.generation !== this.#lifecycle.status.generation ||
      !transport.request.addresses.some(
        (address) => dataPointAddressKey(address) === dataPointAddressKey(point.definition.address)
      )
    )
      return;
    const now = this.#scheduler.now();
    const key = dataPointAddressKey(point.definition.address);
    const sampling = transport.request.samplingIntervalMs ?? 0;
    const last = transport.lastPublished.get(key);
    if (!initial && last !== undefined && now - last < sampling) return;
    transport.lastPublished.set(key, now);
    const event: DataSourceEvent = Object.freeze({
      type: "VALUE",
      adapter: this.identity,
      timestamp: now,
      sequence: point.sequence,
      value: this.#value(point)
    });
    try {
      transport.listener(event);
    } catch {
      /* manager also isolates consumers */
    }
  }
  #value(point: PointState): DataPointValue {
    return normalizeDataPointValue(
      {
        address: point.definition.address,
        value: point.value,
        quality: point.quality,
        sourceTimestamp: point.sourceTimestamp,
        sequence: point.sequence,
        metadata: point.definition.metadata
      },
      { receivedTimestamp: this.#scheduler.now() }
    );
  }
  #reset(): void {
    for (const [index, point] of [...this.#points.values()].entries()) {
      point.value = normalizeJsonValue(point.definition.initialValue);
      point.quality = Object.freeze({
        ...(point.definition.quality ?? { level: "GOOD", reason: "GOOD" })
      });
      point.sequence = 0;
      point.tick = 0;
      point.startedAt = this.#scheduler.now();
      point.sourceTimestamp = point.startedAt;
      point.random = createSeededRandom(point.definition.seed ?? (this.#config.seed ?? 1) + index);
    }
  }
  #snapshot(point: PointState): Readonly<SimulatorPointSnapshot> {
    return Object.freeze({
      address: point.definition.address,
      value: point.value,
      quality: point.quality,
      sequence: point.sequence,
      sourceTimestamp: point.sourceTimestamp
    });
  }
  #cancelPointTasks(): void {
    for (const point of this.#points.values()) {
      point.task?.cancel();
      point.task = undefined;
    }
  }
  #requirePoint(address: DataPointAddress): PointState {
    const point = this.#points.get(dataPointAddressKey(normalizeAddress(address)));
    if (!point)
      throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", "Unknown simulator point.", {
        address
      });
    return point;
  }
  #requireConnected(operation: "read" | "write" | "browse"): void {
    this.#assertActive();
    if (this.#lifecycle.status.state !== "connected")
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "Simulator is not connected.", {
        operation
      });
  }
  #assertActive(): void {
    if (this.#disposed) throw new DataSourceError("DATASOURCE_DISPOSED", "Simulator is disposed.");
  }
  #error(
    code: "DATASOURCE_READ_ERROR" | "DATASOURCE_WRITE_ERROR",
    message: string,
    address: DataPointAddress
  ): Readonly<SerializedDataSourceError> {
    return new DataSourceError(code, message, {
      operation: code === "DATASOURCE_READ_ERROR" ? "read" : "write",
      adapterId: this.identity.id,
      address,
      timestamp: this.#scheduler.now()
    }).toJSON();
  }
  #delay(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const task = this.#scheduler.schedule(delayMs, resolve);
      signal.addEventListener(
        "abort",
        () => {
          task.cancel();
          resolve();
        },
        { once: true }
      );
    });
  }
}
