import { describe, expect, it, vi } from "vitest";
import {
  createDataSourceManager,
  type DataSourceScheduledTask,
  type DataSourceScheduler
} from "../../packages/datasource-core/src/index.js";
import {
  createRestDataSourceAdapter,
  type HttpTransport
} from "../../packages/datasource-rest/src/index.js";
import { createSimulatorDataSource } from "../../packages/datasource-simulator/src/index.js";
import {
  InMemoryTagStore,
  createDataSourceRuntimeIngestion
} from "../../packages/runtime-engine/src/index.js";

class ManualTask implements DataSourceScheduledTask {
  public cancelled = false;
  public cancel(): void {
    this.cancelled = true;
  }
}

class ManualScheduler implements DataSourceScheduler {
  #now = 1_000;
  readonly #tasks: { at: number; callback: () => void; task: ManualTask }[] = [];
  public now(): number {
    return this.#now;
  }
  public schedule(delayMs: number, callback: () => void): DataSourceScheduledTask {
    const task = new ManualTask();
    this.#tasks.push({ at: this.#now + delayMs, callback, task });
    return task;
  }
  public advance(delayMs = 0): void {
    this.#now += delayMs;
    for (;;) {
      const ready = this.#tasks.find(({ at, task }) => at <= this.#now && !task.cancelled);
      if (ready === undefined) break;
      ready.task.cancel();
      ready.callback();
    }
  }
  public get pending(): number {
    return this.#tasks.filter(({ task }) => !task.cancelled).length;
  }
}

class LocalRestTransport implements HttpTransport {
  public fail = false;
  public execute(): Promise<{ status: number; body: string }> {
    return Promise.resolve(
      this.fail
        ? { status: 503, body: '{"error":"unavailable"}' }
        : {
            status: 200,
            body: JSON.stringify({
              value: 72,
              quality: "GOOD",
              timestamp: 1_700_000_000_000,
              sequence: 9
            })
          }
    );
  }
}

describe("Phase 9 final integration", () => {
  it("routes simulator and REST values through one manager into distinct Runtime points", async () => {
    const scheduler = new ManualScheduler();
    const restTransport = new LocalRestTransport();
    const simulatorAddress = { sourceId: "sim-main", key: "temperature" };
    const restAddress = { sourceId: "rest-main", key: "temperature" };
    const simulator = createSimulatorDataSource({
      identity: { id: "sim-main", type: "simulator" },
      scheduler,
      emitInitialValue: true,
      points: [
        {
          address: simulatorAddress,
          dataType: "number",
          initialValue: 21,
          generator: { type: "constant", value: 21 },
          updateIntervalMs: 100
        }
      ]
    });
    const rest = createRestDataSourceAdapter({
      identity: { id: "rest-main", type: "rest" },
      scheduler,
      endpoint: { url: "https://local.invalid/value" },
      response: {
        points: [
          {
            address: restAddress,
            path: ["value"],
            qualityPath: ["quality"],
            timestampPath: ["timestamp"],
            sequencePath: ["sequence"],
            expectedType: "number"
          }
        ]
      },
      polling: { intervalMs: 100, emitImmediately: true },
      transport: restTransport
    });
    const store = new InMemoryTagStore({ now: () => scheduler.now() });
    const ingestion = createDataSourceRuntimeIngestion({
      target: store,
      mappings: [
        { address: simulatorAddress, runtimeKey: "sim.temperature" },
        { address: restAddress, runtimeKey: "rest.temperature" }
      ]
    });
    const manager = createDataSourceManager({
      now: () => scheduler.now(),
      eventSink: (event) => {
        ingestion.ingest(event);
      }
    });

    await manager.register({
      descriptor: { id: "sim-main", adapterType: "simulator", enabled: true },
      adapter: simulator
    });
    await manager.register({
      descriptor: { id: "rest-main", adapterType: "rest", enabled: true },
      adapter: rest
    });
    expect(await manager.connectAll()).toMatchObject({ succeeded: 2, failed: 0 });
    await manager.subscribeSource("sim-main", { addresses: [simulatorAddress] });
    await manager.subscribeSource("rest-main", { addresses: [restAddress] });
    scheduler.advance();
    await Promise.resolve();
    scheduler.advance();

    expect(store.getDataPoint("sim.temperature")).toMatchObject({
      value: 21,
      quality: "good",
      source: "sim-main"
    });
    expect(store.getDataPoint("rest.temperature")).toMatchObject({
      value: 72,
      quality: "good",
      source: "rest-main",
      timestamp: 1_700_000_000_000,
      sequence: 9
    });
    const diagnostics = manager.getDiagnostics();
    expect(
      diagnostics.sources.map(({ descriptor, counters }) => ({
        id: descriptor.id,
        routed: counters.dataEventsRouted
      }))
    ).toEqual([
      { id: "sim-main", routed: 1 },
      { id: "rest-main", routed: 1 }
    ]);

    await manager.dispose();
    expect(scheduler.pending).toBe(0);
  });

  it("isolates a failing network-oriented source and stops Runtime ingestion after disposal", async () => {
    const scheduler = new ManualScheduler();
    const transport = new LocalRestTransport();
    transport.fail = true;
    const restAddress = { sourceId: "rest-failing", key: "value" };
    const simulatorAddress = { sourceId: "sim-healthy", key: "value" };
    const rest = createRestDataSourceAdapter({
      identity: { id: "rest-failing", type: "rest" },
      scheduler,
      endpoint: { url: "https://local.invalid/failing" },
      response: { points: [{ address: restAddress, path: ["value"] }] },
      transport
    });
    const simulator = createSimulatorDataSource({
      identity: { id: "sim-healthy", type: "simulator" },
      scheduler,
      emitInitialValue: true,
      points: [
        {
          address: simulatorAddress,
          dataType: "number",
          initialValue: 10,
          generator: { type: "constant", value: 10 }
        }
      ]
    });
    const runtimeSink = vi.fn();
    const manager = createDataSourceManager({ eventSink: runtimeSink });
    await manager.register({
      descriptor: { id: "rest-failing", adapterType: "rest", enabled: true },
      adapter: rest
    });
    await manager.register({
      descriptor: { id: "sim-healthy", adapterType: "simulator", enabled: true },
      adapter: simulator
    });

    const result = await manager.connectAll();
    expect(result).toMatchObject({ succeeded: 2, failed: 0 });
    await expect(rest.read({ addresses: [restAddress] })).resolves.toMatchObject({
      values: [],
      failures: [expect.objectContaining({ address: restAddress })]
    });
    const handle = await manager.subscribeSource("sim-healthy", {
      addresses: [simulatorAddress]
    });
    scheduler.advance();
    expect(runtimeSink).toHaveBeenCalledOnce();
    await manager.dispose();
    expect(handle.closed).toBe(true);
    scheduler.advance(10_000);
    expect(runtimeSink).toHaveBeenCalledOnce();
  });
});
