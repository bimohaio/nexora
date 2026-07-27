import { describe, expect, it, vi } from "vitest";
import type { RuntimeBatchResult, RuntimeDataPointInput, RuntimeScheduler } from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import {
  createGeneratorScenario,
  createRuntimeSimulator,
  incrementalCounter,
  sineWave,
  squareWave
} from "./simulator.js";
import { InMemoryTagStore } from "./store.js";

class TestScheduler implements RuntimeScheduler {
  public nowValue = 1000;
  readonly #tasks = new Map<number, () => void>();
  #nextId = 0;

  public now(): number {
    return this.nowValue;
  }

  public setTimeout(callback: () => void): unknown {
    const id = this.#nextId++;
    this.#tasks.set(id, callback);
    return id;
  }

  public clearTimeout(handle: unknown): void {
    this.#tasks.delete(handle as number);
  }

  public flushOne(): void {
    const entry = [...this.#tasks.entries()].at(0);
    if (entry === undefined) return;
    this.#tasks.delete(entry[0]);
    entry[1]();
  }

  public get pendingCount(): number {
    return this.#tasks.size;
  }
}

describe("DeterministicRuntimeSimulator", () => {
  it("emits one atomic industrial batch per deterministic manual tick", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const firstScheduler = new TestScheduler();
    const first = createRuntimeSimulator({ sink: store, seed: 42, scheduler: firstScheduler });
    const secondStore = new InMemoryTagStore({ now: () => 1000 });
    const secondScheduler = new TestScheduler();
    const second = createRuntimeSimulator({
      sink: secondStore,
      seed: 42,
      scheduler: secondScheduler
    });

    const firstTick = first.tick();
    const secondTick = second.tick();

    expect(firstTick).toMatchObject({ tick: 0, emitted: 7, batch: { revision: 1 } });
    expect(secondTick).toEqual(firstTick);
    expect(store.snapshot().getAll()).toEqual(secondStore.snapshot().getAll());
    expect(store.snapshot().get("process.area-a.tank-t101.level")?.source).toBe(
      "runtime-simulator"
    );
  });

  it("supports start, pause, resume, stop, reset, and idempotent disposal", () => {
    const scheduler = new TestScheduler();
    const updateMany = vi.fn(
      (_inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult => ({
        changed: true,
        revision: 1,
        accepted: 1,
        rejected: 0,
        diagnostics: []
      })
    );
    const simulator = createRuntimeSimulator({
      sink: { updateMany },
      scheduler,
      scenario: ({ tick, now }) => [{ key: "tick", value: tick, timestamp: now }]
    });

    simulator.start();
    simulator.start();
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flushOne();
    expect(simulator.tickCount).toBe(1);
    expect(scheduler.pendingCount).toBe(1);

    simulator.pause();
    expect(simulator.paused).toBe(true);
    expect(scheduler.pendingCount).toBe(0);
    simulator.resume();
    simulator.setSpeed(2);
    expect(simulator.speed).toBe(2);
    scheduler.flushOne();
    expect(simulator.tickCount).toBe(2);

    simulator.stop();
    expect(simulator.running).toBe(false);
    simulator.reset();
    expect(simulator.tickCount).toBe(0);
    simulator.dispose();
    simulator.dispose();
    expect(simulator.disposed).toBe(true);
    expect(() => simulator.tick()).toThrow(RuntimeEngineError);
  });

  it("composes sine, square, and counter generators without protocol dependencies", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const simulator = createRuntimeSimulator({
      sink: store,
      scenario: createGeneratorScenario({
        sine: sineWave(0, 10, 4),
        square: squareWave(false, true, 2),
        count: incrementalCounter(5, 2)
      })
    });
    simulator.tick();
    expect(store.getDataPoint("sine")?.value).toBe(5);
    expect(store.getDataPoint("square")?.value).toBe(true);
    expect(store.getDataPoint("count")?.value).toBe(5);
  });

  it("produces documented uncertain, disconnected, and recovered quality phases", () => {
    const store = new InMemoryTagStore({ now: () => 1000 });
    const simulator = createRuntimeSimulator({ sink: store });
    for (let index = 0; index <= 20; index += 1) simulator.tick();
    expect(store.getDataPoint("process.area-a.tank-t101.level")).toMatchObject({
      quality: "uncertain",
      qualityDetail: "stale"
    });
    for (let index = 21; index <= 25; index += 1) simulator.tick();
    expect(store.getDataPoint("process.area-a.tank-t101.level")).toMatchObject({
      quality: "bad",
      qualityDetail: "disconnected"
    });
    for (let index = 26; index <= 29; index += 1) simulator.tick();
    expect(store.getDataPoint("process.area-a.tank-t101.level")).toMatchObject({
      quality: "good"
    });
  });
});
