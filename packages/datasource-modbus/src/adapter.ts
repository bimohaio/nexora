import {
  DataSourceError,
  SystemDataSourceScheduler,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  createSubscriptionManager,
  normalizeAddress,
  normalizeDataPointValue,
  validateReadRequest,
  validateWriteRequest,
  type BrowseRequest,
  type BrowseResult,
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
  type SerializedDataSourceError,
  type SubscriptionActivationContext,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteItemResult,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import type { JsonValue } from "@web-scada/core";
import type {
  ModbusAdapterConfig,
  ModbusDataSource,
  ModbusDiagnosticsSnapshot,
  ModbusPointDefinition,
  ModbusTransport
} from "./contracts.js";
import { modbusDataPointAddress } from "./addressing.js";
import { decodeRegisters, encodeRegisters, registerSpan } from "./codec.js";
import { ModbusRequestCoordinator } from "./coordinator.js";
import { buildPollingPlan, type ModbusPollGroup } from "./polling.js";
import { validateModbusConfig } from "./validation.js";

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
interface PollTransport {
  id: string;
  closed: boolean;
  tasks: Set<DataSourceScheduledTask>;
  running: Set<string>;
  listener: DataSourceEventListener;
  generation: number;
  sequence: number;
  previous: Map<string, { value: JsonValue; quality: string }>;
}
export function createModbusDataSourceAdapter(
  config: Readonly<ModbusAdapterConfig>
): ModbusDataSource {
  return new ModbusAdapter(config);
}
class ModbusAdapter implements ModbusDataSource {
  public readonly identity;
  public readonly capabilities = CAPABILITIES;
  public readonly permissions: DataSourcePermissions;
  readonly #config: Readonly<ModbusAdapterConfig>;
  readonly #scheduler;
  readonly #lifecycle;
  readonly #subscriptions;
  readonly #points = new Map<string, Readonly<ModbusPointDefinition>>();
  readonly #coordinator = new ModbusRequestCoordinator();
  #transport: ModbusTransport | undefined;
  #disposed = false;
  #nextPoll = 1;
  #stats = {
    activeGroups: 0,
    completedReads: 0,
    failedReads: 0,
    missedCycles: 0,
    lastSuccessfulRead: undefined as number | undefined,
    lastFailure: undefined as number | undefined
  };
  constructor(config: Readonly<ModbusAdapterConfig>) {
    validateModbusConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity });
    this.#scheduler = config.scheduler ?? new SystemDataSourceScheduler();
    for (const point of config.points)
      this.#points.set(
        point.id,
        Object.freeze({
          ...point,
          address: Object.freeze({ ...point.address }),
          ...(point.metadata ? { metadata: Object.freeze({ ...point.metadata }) } : {})
        })
      );
    const writable =
      config.writes?.enabled === true && config.points.some((point) => point.writable);
    this.permissions = Object.freeze({
      READ: true,
      WRITE: writable,
      SUBSCRIBE: true,
      BROWSE: true,
      HISTORY_READ: false
    });
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      scheduler: this.#scheduler,
      ...(config.connection.transport === "tcp"
        ? { connectTimeoutMs: config.connection.connectTimeoutMs ?? 10_000 }
        : {}),
      ...(config.reconnectPolicy ? { reconnectPolicy: config.reconnectPolicy } : {}),
      operations: {
        connect: async ({ signal }) => {
          if (!config.transportFactory)
            throw new DataSourceError(
              "DATASOURCE_CONFIGURATION_ERROR",
              "A Modbus transport factory is required. Use the Node TCP factory or provide a custom transport.",
              { recoverable: false }
            );
          const transport = await config.transportFactory({
            adapterId: this.identity.id,
            connection: config.connection,
            ...(config.connection.connectionRef
              ? { connectionRef: config.connection.connectionRef }
              : {})
          });
          this.#transport = transport;
          try {
            await transport.connect(signal);
          } catch (error) {
            await transport.dispose();
            if (this.#transport === transport) this.#transport = undefined;
            throw error;
          }
        },
        disconnect: async () => {
          const transport = this.#transport;
          this.#transport = undefined;
          if (transport) {
            await transport.disconnect();
            await transport.dispose();
          }
        }
      }
    });
    this.#subscriptions = createSubscriptionManager({
      adapterId: this.identity.id,
      lifecycle: this.#lifecycle,
      now: () => this.#scheduler.now(),
      transport: {
        activate: (request, listener, context) => this.#activate(request, listener, context)
      }
    });
  }
  connect(): Promise<void> {
    this.#active();
    return this.#lifecycle.connect();
  }
  disconnect(): Promise<void> {
    this.#active();
    return this.#lifecycle.disconnect();
  }
  getStatus(): Readonly<DataSourceStatus> {
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
  subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle> {
    this.#active();
    assertOperationAllowed("subscribe", this.capabilities, this.permissions);
    return this.#subscriptions.subscribe(request, listener);
  }
  async read(request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    this.#connected("read");
    validateReadRequest(request);
    const values: DataPointValue[] = [],
      failures = [];
    for (const address of request.addresses) {
      const point = this.#points.get(normalizeAddress(address).key);
      if (!point) {
        failures.push(
          Object.freeze({
            address: normalizeAddress(address),
            error: this.#error(
              "DATASOURCE_READ_ERROR",
              "Unknown Modbus point.",
              address.key,
              "read",
              request.correlationId
            )
          })
        );
        continue;
      }
      try {
        values.push(await this.#readPoint(point, "read"));
      } catch (cause) {
        failures.push(
          Object.freeze({
            address: normalizeAddress(address),
            error: this.#normalizeError(cause, point, "read", request.correlationId)
          })
        );
      }
    }
    return Object.freeze({ values: Object.freeze(values), failures: Object.freeze(failures) });
  }
  async write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    this.#connected("write");
    assertOperationAllowed("write", this.capabilities, this.permissions);
    validateWriteRequest(request);
    const results: WriteItemResult[] = [];
    for (const item of request.items) {
      const address = normalizeAddress(item.address),
        point = this.#points.get(address.key);
      try {
        if (!point?.writable)
          throw new DataSourceError("DATASOURCE_ACCESS_DENIED", "Modbus point is not writable.");
        await this.#coordinator.run("write", () => this.#writePoint(point, item.value));
        if ((this.#config.writes?.verification ?? "none") !== "none") {
          const actual = (await this.#readPoint(point, "read")).value;
          const match =
            this.#config.writes?.verification === "tolerance" &&
            typeof actual === "number" &&
            typeof item.value === "number"
              ? Math.abs(actual - item.value) <= (this.#config.writes.tolerance ?? 0)
              : deepEqual(actual, item.value);
          if (!match)
            throw new DataSourceError(
              "DATASOURCE_WRITE_ERROR",
              "Modbus write read-back verification failed."
            );
        }
        results.push(Object.freeze({ ok: true, address }));
      } catch (cause) {
        results.push(
          Object.freeze({
            ok: false,
            address,
            error: this.#normalizeError(cause, point, "write", request.correlationId, address)
          })
        );
      }
    }
    return Object.freeze({ results: Object.freeze(results) });
  }
  async browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    this.#connected("browse");
    return Object.freeze({
      points: Object.freeze(
        [...this.#points.values()].map((point) =>
          Object.freeze({
            address: modbusDataPointAddress(this.identity.id, point.id),
            dataType: point.dataType,
            readable: true,
            writable: point.writable === true && this.permissions.WRITE,
            ...(point.metadata ? { metadata: point.metadata } : {})
          })
        )
      )
    });
  }
  getDiagnostics(): Readonly<ModbusDiagnosticsSnapshot> {
    return Object.freeze({
      activeGroups: this.#stats.activeGroups,
      pointCount: this.#points.size,
      completedReads: this.#stats.completedReads,
      failedReads: this.#stats.failedReads,
      missedCycles: this.#stats.missedCycles,
      ...(this.#stats.lastSuccessfulRead === undefined
        ? {}
        : { lastSuccessfulRead: this.#stats.lastSuccessfulRead }),
      ...(this.#stats.lastFailure === undefined ? {} : { lastFailure: this.#stats.lastFailure })
    });
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#coordinator.dispose();
    await this.#subscriptions.dispose();
    await this.#lifecycle.dispose();
    this.#transport = undefined;
  }
  async #activate(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle> {
    const points = request.addresses.map((address) => {
      const point = this.#points.get(address.key);
      if (!point)
        throw new DataSourceError(
          "DATASOURCE_SUBSCRIPTION_ERROR",
          `Unknown Modbus point '${address.key}'.`
        );
      return point;
    });
    const groups = buildPollingPlan(points, {
      unitId: this.#config.connection.unitId ?? 1,
      intervalMs: request.samplingIntervalMs ?? this.#config.polling?.intervalMs ?? 1000,
      mergeGap: this.#config.polling?.mergeGap ?? 0,
      ...(this.#config.limits ? { limits: this.#config.limits } : {})
    });
    const state: PollTransport = {
      id: `${this.identity.id}:poll:${this.#nextPoll++}`,
      closed: false,
      tasks: new Set(),
      running: new Set(),
      listener,
      generation: context.generation,
      sequence: 0,
      previous: new Map()
    };
    this.#stats.activeGroups += groups.length;
    for (const group of groups) this.#scheduleGroup(state, group, 0);
    return {
      id: state.id,
      get closed() {
        return state.closed;
      },
      unsubscribe: () => {
        if (state.closed) return;
        state.closed = true;
        for (const task of state.tasks) task.cancel();
        state.tasks.clear();
        this.#stats.activeGroups -= groups.length;
      }
    };
  }
  #scheduleGroup(state: PollTransport, group: Readonly<ModbusPollGroup>, delay: number): void {
    const task = this.#scheduler.schedule(delay, () => {
      state.tasks.delete(task);
      if (state.closed || this.#disposed || state.generation !== this.#lifecycle.status.generation)
        return;
      const key = `${group.unitId}|${group.area}|${group.start}`;
      if (state.running.has(key)) {
        this.#stats.missedCycles++;
        this.#scheduleGroup(state, group, group.intervalMs);
        return;
      }
      state.running.add(key);
      void this.#coordinator
        .run("poll", () => this.#readGroup(group))
        .then((values) => {
          const now = this.#scheduler.now();
          this.#stats.completedReads++;
          this.#stats.lastSuccessfulRead = now;
          for (const point of group.points) {
            const value = this.#decodeGroupPoint(group, point, values),
              previous = state.previous.get(point.id);
            const changed =
              !previous ||
              previous.quality !== "GOOD" ||
              !withinDeadband(previous.value, value, point.deadband);
            state.previous.set(point.id, { value, quality: "GOOD" });
            if (changed) this.#emit(state, point, value, { level: "GOOD", reason: "GOOD" }, now);
          }
        })
        .catch((cause: unknown) => {
          const now = this.#scheduler.now();
          this.#stats.failedReads++;
          this.#stats.lastFailure = now;
          for (const point of group.points) {
            const previous = state.previous.get(point.id);
            state.previous.set(point.id, { value: previous?.value ?? null, quality: "BAD" });
            this.#emit(state, point, previous?.value ?? null, qualityFor(cause), now);
          }
        })
        .finally(() => {
          state.running.delete(key);
          if (!state.closed) this.#scheduleGroup(state, group, group.intervalMs);
        });
    });
    state.tasks.add(task);
  }
  async #readGroup(
    group: Readonly<ModbusPollGroup>
  ): Promise<readonly boolean[] | readonly number[]> {
    const transport = this.#requireTransport();
    switch (group.area) {
      case "coil":
        return transport.readCoils(group.unitId, group.start, group.quantity);
      case "discrete-input":
        return transport.readDiscreteInputs(group.unitId, group.start, group.quantity);
      case "holding-register":
        return transport.readHoldingRegisters(group.unitId, group.start, group.quantity);
      case "input-register":
        return transport.readInputRegisters(group.unitId, group.start, group.quantity);
    }
  }
  #decodeGroupPoint(
    group: Readonly<ModbusPollGroup>,
    point: Readonly<ModbusPointDefinition>,
    values: readonly boolean[] | readonly number[]
  ): JsonValue {
    const offset = point.address.address - group.start;
    if (group.area === "coil" || group.area === "discrete-input") return Boolean(values[offset]);
    return decodeRegisters(
      (values as readonly number[]).slice(offset, offset + registerSpan(point)),
      point
    );
  }
  async #readPoint(
    point: Readonly<ModbusPointDefinition>,
    priority: "read" | "poll"
  ): Promise<DataPointValue> {
    return this.#coordinator.run(priority, async () => {
      const group = buildPollingPlan([point], {
        unitId: this.#config.connection.unitId ?? 1,
        intervalMs: 1,
        mergeGap: 0,
        ...(this.#config.limits ? { limits: this.#config.limits } : {})
      })[0]!;
      const raw = await this.#readGroup(group),
        now = this.#scheduler.now();
      this.#stats.completedReads++;
      this.#stats.lastSuccessfulRead = now;
      return normalizeDataPointValue(
        {
          address: modbusDataPointAddress(this.identity.id, point.id),
          value: this.#decodeGroupPoint(group, point, raw),
          quality: { level: "GOOD", reason: "GOOD" },
          sourceTimestamp: now,
          metadata: point.metadata
        },
        { receivedTimestamp: now }
      );
    });
  }
  async #writePoint(point: Readonly<ModbusPointDefinition>, value: JsonValue): Promise<void> {
    const transport = this.#requireTransport(),
      unit = point.address.unitId ?? this.#config.connection.unitId ?? 1,
      address = point.address.address;
    if (point.address.area === "coil") {
      if (typeof value !== "boolean")
        throw new DataSourceError("DATASOURCE_WRITE_ERROR", "Coil write requires a boolean.");
      if (!transport.writeSingleCoil)
        throw new DataSourceError(
          "DATASOURCE_UNSUPPORTED_OPERATION",
          "Transport does not support coil writes."
        );
      await transport.writeSingleCoil(unit, address, value);
      return;
    }
    if (point.address.area !== "holding-register")
      throw new DataSourceError("DATASOURCE_ACCESS_DENIED", "Modbus data area is read-only.");
    if (point.bitIndex !== undefined)
      throw new DataSourceError(
        "DATASOURCE_UNSUPPORTED_OPERATION",
        "Register bit writes require a safe mask-write transport and are disabled."
      );
    const registers = encodeRegisters(value, point);
    if (registers.length > (this.#config.limits?.maxRegistersPerWrite ?? 123))
      throw new DataSourceError(
        "DATASOURCE_WRITE_ERROR",
        "Write exceeds configured register limit."
      );
    if (registers.length === 1 && transport.writeSingleRegister)
      await transport.writeSingleRegister(unit, address, registers[0]!);
    else if (transport.writeMultipleRegisters)
      await transport.writeMultipleRegisters(unit, address, registers);
    else
      throw new DataSourceError(
        "DATASOURCE_UNSUPPORTED_OPERATION",
        "Transport does not support the required register write."
      );
  }
  #emit(
    state: PollTransport,
    point: Readonly<ModbusPointDefinition>,
    value: JsonValue,
    quality: { level: "GOOD" | "BAD"; reason: "GOOD" | "TIMEOUT" | "COMMUNICATION_FAILURE" },
    now: number
  ): void {
    const event: DataSourceEvent = Object.freeze({
      type: "VALUE",
      adapter: this.identity,
      timestamp: now,
      sequence: ++state.sequence,
      value: normalizeDataPointValue(
        {
          address: modbusDataPointAddress(this.identity.id, point.id),
          value,
          quality,
          sourceTimestamp: now,
          sequence: state.sequence,
          metadata: point.metadata
        },
        { receivedTimestamp: now }
      )
    });
    try {
      state.listener(event);
    } catch {
      /* consumer isolation */
    }
  }
  #requireTransport(): ModbusTransport {
    if (!this.#transport)
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "Modbus transport is not connected.", {
        recoverable: true
      });
    return this.#transport;
  }
  #connected(operation: "read" | "write" | "browse"): void {
    this.#active();
    if (this.#lifecycle.status.state !== "connected")
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "Modbus adapter is not connected.", {
        operation
      });
  }
  #active(): void {
    if (this.#disposed)
      throw new DataSourceError("DATASOURCE_DISPOSED", "Modbus adapter is disposed.");
  }
  #error(
    code: "DATASOURCE_READ_ERROR" | "DATASOURCE_WRITE_ERROR",
    message: string,
    pointId: string,
    operation: "read" | "write",
    correlationId?: string
  ): SerializedDataSourceError {
    return new DataSourceError(code, message, {
      adapterId: this.identity.id,
      operation,
      ...(correlationId ? { correlationId } : {}),
      address: modbusDataPointAddress(this.identity.id, pointId),
      timestamp: this.#scheduler.now()
    }).toJSON();
  }
  #normalizeError(
    cause: unknown,
    point: Readonly<ModbusPointDefinition> | undefined,
    operation: "read" | "write",
    correlationId?: string,
    address = modbusDataPointAddress(this.identity.id, point?.id ?? "unknown")
  ): SerializedDataSourceError {
    if (cause instanceof DataSourceError)
      return new DataSourceError(cause.code, cause.message, {
        operation,
        adapterId: this.identity.id,
        address,
        recoverable: cause.recoverable,
        context: cause.context,
        cause,
        ...(correlationId ? { correlationId } : {})
      }).toJSON();
    return new DataSourceError(
      operation === "read" ? "DATASOURCE_READ_ERROR" : "DATASOURCE_WRITE_ERROR",
      `Modbus ${operation} failed.`,
      { operation, adapterId: this.identity.id, address, recoverable: operation === "read", cause }
    ).toJSON();
  }
}
function qualityFor(error: unknown): { level: "BAD"; reason: "TIMEOUT" | "COMMUNICATION_FAILURE" } {
  return {
    level: "BAD",
    reason:
      error instanceof DataSourceError && error.code === "DATASOURCE_TIMEOUT"
        ? "TIMEOUT"
        : "COMMUNICATION_FAILURE"
  };
}
function withinDeadband(previous: JsonValue, next: JsonValue, deadband?: number): boolean {
  if (typeof previous === "number" && typeof next === "number" && deadband !== undefined)
    return Math.abs(previous - next) <= deadband;
  return deepEqual(previous, next);
}
function deepEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
