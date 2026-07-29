import type { JsonValue } from "@web-scada/core";
import {
  createDataSourceManager,
  type DataSourceEvent,
  type DataSourceManager,
  type DiagnosticsSnapshot,
  type SubscriptionHandle
} from "@web-scada/datasource-core";
import {
  createSimulatorDataSource,
  type SimulatorDataSource,
  type SimulatorPointDefinition
} from "@web-scada/datasource-simulator";
import type {
  DataProvider,
  DataProviderStatusEvent,
  DataQuality,
  RuntimeValue,
  TagStoreListener
} from "@web-scada/runtime-engine";

const SOURCE_ID = "browser-simulator";
const UPDATE_INTERVAL_MS = 750;
const VALUE_HISTORY_LIMIT = 100;

type ProviderObserver = () => void;

export class ManagedSimulatorProvider implements DataProvider {
  readonly #statusListeners = new Set<(event: DataProviderStatusEvent) => void>();
  readonly #observers = new Set<ProviderObserver>();
  readonly #values = new Map<string, RuntimeValue>();
  readonly #adapter: SimulatorDataSource;
  readonly #manager: DataSourceManager;
  #listener: TagStoreListener | undefined;
  #tagIds = new Set<string>();
  #subscription: Readonly<SubscriptionHandle> | undefined;
  #activation: Promise<void> | undefined;
  #registered = false;
  #available = true;
  #paused = false;
  #disposed = false;
  #quality: DataQuality = "good";
  #alarm = false;
  #eventRevision = 0;
  #subscriptionGeneration = 0;

  public constructor() {
    this.#adapter = createSimulatorDataSource({
      identity: {
        id: SOURCE_ID,
        type: "simulator",
        displayName: "Deterministic browser simulator"
      },
      seed: 9,
      emitInitialValue: true,
      points: createBrowserSimulatorScenario()
    });
    this.#manager = createDataSourceManager({
      historyCapacity: 50,
      eventSink: (event) => {
        this.#route(event);
      }
    });
  }

  public async connect(): Promise<void> {
    this.#assertActive();
    if (!this.#available) throw new Error("Browser simulator is unavailable.");
    await this.#ensureRegistered();
    await this.#manager.connect(SOURCE_ID);
    this.#emitStatus({ status: "connected" });
    this.#notify();
  }

  public async disconnect(): Promise<void> {
    if (this.#disposed || !this.#registered) return;
    await this.#releaseSubscription();
    await this.#manager.disconnect(SOURCE_ID);
    this.#emitStatus({ status: "disconnected" });
    this.#notify();
  }

  public subscribe(tagIds: readonly string[], listener: TagStoreListener): () => void {
    this.#assertActive();
    this.#tagIds = new Set(tagIds);
    this.#listener = listener;
    const generation = ++this.#subscriptionGeneration;
    this.#activation = this.#activateSubscription(generation).catch((error: unknown) => {
      this.#emitStatus({ status: "error", error });
      this.#notify();
    });
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      ++this.#subscriptionGeneration;
      this.#listener = undefined;
      this.#tagIds.clear();
      void this.#releaseSubscription();
    };
  }

  public subscribeStatus(listener: (event: DataProviderStatusEvent) => void): () => void {
    this.#statusListeners.add(listener);
    return () => {
      this.#statusListeners.delete(listener);
    };
  }

  public observe(listener: ProviderObserver): () => void {
    this.#observers.add(listener);
    return () => {
      this.#observers.delete(listener);
    };
  }

  public async setAvailable(available: boolean): Promise<void> {
    this.#available = available;
    if (!available) await this.disconnect();
    this.#notify();
  }

  public setQuality(quality: DataQuality): void {
    this.#quality = quality;
    const level = quality === "good" ? "GOOD" : quality === "uncertain" ? "UNCERTAIN" : "BAD";
    for (const point of createBrowserSimulatorScenario())
      this.#adapter.control.setQuality(point.address, {
        level,
        reason: level === "GOOD" ? "GOOD" : "COMMUNICATION_FAILURE"
      });
    this.#notify();
  }

  public setPaused(paused: boolean): void {
    this.#paused = paused;
    if (paused) this.#adapter.control.pause();
    else {
      this.#adapter.control.resume();
      void this.#refreshValues();
    }
    this.#notify();
  }

  public reset(): void {
    this.#adapter.control.reset();
    this.#values.clear();
    this.#eventRevision = 0;
    this.#notify();
  }

  public async setAlarm(alarm: boolean): Promise<void> {
    this.#alarm = alarm;
    await this.#adapter.write({
      items: [
        {
          address: { sourceId: SOURCE_ID, key: "process.feed-pump.state" },
          value: alarm ? "alarm" : "running"
        },
        {
          address: { sourceId: SOURCE_ID, key: "process.main-pipe.color" },
          value: alarm ? "#ef4444" : "#38bdf8"
        }
      ]
    });
    this.#notify();
  }

  public async reconnect(): Promise<void> {
    this.#available = true;
    await this.#manager.reconnect(SOURCE_ID);
    if (this.#listener !== undefined)
      await this.#activateSubscription(++this.#subscriptionGeneration);
    this.#emitStatus({ status: "connected" });
    this.#notify();
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#releaseSubscription();
    await this.#manager.dispose();
    this.#statusListeners.clear();
    this.#observers.clear();
    this.#listener = undefined;
    this.#tagIds.clear();
    this.#values.clear();
  }

  public get available(): boolean {
    return this.#available;
  }

  public get paused(): boolean {
    return this.#paused;
  }

  public get quality(): DataQuality {
    return this.#quality;
  }

  public get alarm(): boolean {
    return this.#alarm;
  }

  public get eventRevision(): number {
    return this.#eventRevision;
  }

  public getDiagnostics(): Readonly<DiagnosticsSnapshot> {
    return this.#manager.getDiagnostics();
  }

  public getRecentValues(): readonly RuntimeValue[] {
    return [...this.#values.values()].slice(-VALUE_HISTORY_LIMIT);
  }

  async #ensureRegistered(): Promise<void> {
    if (this.#registered) return;
    await this.#manager.register({
      descriptor: {
        id: SOURCE_ID,
        displayName: "Browser Simulator",
        adapterType: "simulator",
        group: "browser-demo",
        enabled: true,
        tags: ["demo", "deterministic"]
      },
      adapter: this.#adapter,
      healthPolicy: {
        enabled: true,
        staleAfterMs: 3_000,
        unhealthyAfterMs: 8_000
      }
    });
    this.#registered = true;
  }

  async #activateSubscription(generation: number): Promise<void> {
    await this.#ensureRegistered();
    const previous = this.#subscription;
    this.#subscription = undefined;
    await previous?.unsubscribe();
    if (this.#listener === undefined || this.#tagIds.size === 0) return;
    const subscription = await this.#manager.subscribeSource(SOURCE_ID, {
      id: "runtime-values",
      addresses: [...this.#tagIds].map((key) => ({ sourceId: SOURCE_ID, key })),
      samplingIntervalMs: 0,
      publishIntervalMs: UPDATE_INTERVAL_MS,
      queueSize: 1,
      discardOldest: true
    });
    if (generation !== this.#subscriptionGeneration) {
      await subscription.unsubscribe();
      return;
    }
    this.#subscription = subscription;
    this.#notify();
  }

  async #releaseSubscription(): Promise<void> {
    const generation = this.#subscriptionGeneration;
    const activation = this.#activation;
    this.#activation = undefined;
    await activation?.catch(() => undefined);
    if (generation !== this.#subscriptionGeneration) return;
    const subscription = this.#subscription;
    this.#subscription = undefined;
    await subscription?.unsubscribe();
  }

  #route(event: Readonly<DataSourceEvent>): void {
    if (event.type !== "VALUE" || this.#listener === undefined) return;
    const runtimeValue: RuntimeValue = Object.freeze({
      tagId: event.value.address.key,
      value: event.value.value,
      dataType: runtimeType(event.value.value),
      quality: runtimeQuality(event.value.quality.level),
      timestamp: new Date(
        event.value.sourceTimestamp ?? event.value.receivedTimestamp
      ).toISOString(),
      source: event.adapter.id,
      ...(event.value.sequence === undefined ? {} : { sequence: event.value.sequence })
    });
    this.#quality = runtimeValue.quality;
    this.#eventRevision += 1;
    this.#values.delete(runtimeValue.tagId);
    this.#values.set(runtimeValue.tagId, runtimeValue);
    this.#listener(runtimeValue);
    this.#notify();
  }

  async #refreshValues(): Promise<void> {
    if (this.#listener === undefined || this.#tagIds.size === 0) return;
    const result = await this.#adapter.read({
      addresses: [...this.#tagIds].map((key) => ({ sourceId: SOURCE_ID, key }))
    });
    for (const value of result.values)
      this.#route({
        type: "VALUE",
        adapter: this.#adapter.identity,
        timestamp: value.receivedTimestamp,
        ...(value.sequence === undefined ? {} : { sequence: value.sequence }),
        value
      });
  }

  #emitStatus(event: DataProviderStatusEvent): void {
    for (const listener of this.#statusListeners) listener(event);
  }

  #notify(): void {
    for (const observer of this.#observers) observer();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Browser simulator provider is disposed.");
  }
}

export function createBrowserSimulatorScenario(): readonly SimulatorPointDefinition[] {
  const point = (
    key: string,
    initialValue: JsonValue,
    generator: SimulatorPointDefinition["generator"],
    writable = false
  ): SimulatorPointDefinition => ({
    address: { sourceId: SOURCE_ID, key },
    dataType:
      typeof initialValue === "number"
        ? "number"
        : typeof initialValue === "boolean"
          ? "boolean"
          : "string",
    initialValue,
    generator,
    updateIntervalMs: UPDATE_INTERVAL_MS,
    readable: true,
    writable
  });
  return Object.freeze([
    point("process.raw-tank.level", 0.62, {
      type: "sine",
      minimum: 0.38,
      maximum: 0.86,
      periodMs: 12_000,
      precision: 3
    }),
    point("process.clean-tank.level", 0.54, {
      type: "sine",
      minimum: 0.24,
      maximum: 0.84,
      periodMs: 16_000,
      phase: -0.8,
      precision: 3
    }),
    point("process.inlet-valve.state", "active", {
      type: "sequence",
      values: ["active", "active", "active", "inactive"]
    }),
    point("process.feed-pump.state", "running", { type: "manual" }, true),
    point("process.mixer.state", "running", { type: "constant", value: "running" }),
    point("process.outlet-valve.state", "active", { type: "constant", value: "active" }),
    point("process.feed-motor.state", "running", { type: "constant", value: "running" }),
    point("process.flow.state", "active", {
      type: "sequence",
      values: ["active", "active", "warning"]
    }),
    point("process.pressure.state", "active", {
      type: "sequence",
      values: ["active", "active", "warning"]
    }),
    point("process.temperature.state", "active", { type: "constant", value: "active" }),
    point("process.clean-level.state", "active", { type: "constant", value: "active" }),
    point("control.plc.state", "running", { type: "constant", value: "running" }),
    point("control.beacon.state", "inactive", { type: "constant", value: "inactive" }),
    point("process.flow.text", "74.0 m³/h", {
      type: "sequence",
      values: ["74.0 m³/h", "81.5 m³/h", "68.2 m³/h"]
    }),
    point("process.pressure.text", "3.15 bar", {
      type: "sequence",
      values: ["3.15 bar", "3.44 bar", "3.72 bar"]
    }),
    point("process.temperature.text", "26.5 °C", {
      type: "sequence",
      values: ["26.5 °C", "28.1 °C", "29.8 °C"]
    }),
    point("process.clean-level.text", "54 %", {
      type: "sequence",
      values: ["54 %", "61 %", "68 %"]
    }),
    point("process.main-pipe.color", "#38bdf8", { type: "manual" }, true)
  ]);
}

function runtimeType(value: JsonValue): RuntimeValue["dataType"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "json";
}

function runtimeQuality(level: "GOOD" | "UNCERTAIN" | "BAD" | "UNKNOWN"): DataQuality {
  return level === "GOOD"
    ? "good"
    : level === "UNCERTAIN"
      ? "uncertain"
      : level === "BAD"
        ? "bad"
        : "unknown";
}
