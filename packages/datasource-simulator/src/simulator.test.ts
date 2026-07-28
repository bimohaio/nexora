import { describe, expect, it } from "vitest";
import type { DataSourceScheduledTask, DataSourceScheduler } from "@web-scada/datasource-core";
import { createSimulatorDataSource } from "./index.js";
import type { SimulatorDataSource } from "./index.js";

class Task implements DataSourceScheduledTask {
  public cancelled = false;
  public cancel(): void {
    this.cancelled = true;
  }
}
class ManualScheduler implements DataSourceScheduler {
  #now = 1_000;
  readonly tasks: { at: number; callback: () => void; task: Task }[] = [];
  public now(): number {
    return this.#now;
  }
  public schedule(delay: number, callback: () => void): DataSourceScheduledTask {
    const task = new Task();
    this.tasks.push({ at: this.#now + delay, callback, task });
    return task;
  }
  public advance(delay: number): void {
    this.#now += delay;
    for (const item of this.tasks.filter(({ at, task }) => at <= this.#now && !task.cancelled)) {
      item.task.cancel();
      item.callback();
    }
  }
  public get pending(): number {
    return this.tasks.filter(({ task }) => !task.cancelled).length;
  }
}

const address = Object.freeze({ sourceId: "sim", key: "counter" });
function fixture(scheduler: ManualScheduler): SimulatorDataSource {
  return createSimulatorDataSource({
    identity: { id: "sim", type: "simulator" },
    scheduler,
    seed: 42,
    points: [
      {
        address,
        dataType: "number",
        initialValue: 0,
        generator: { type: "counter", step: 2, minimum: 0, maximum: 4 },
        updateIntervalMs: 100,
        readable: true
      },
      {
        address: { sourceId: "sim", key: "setpoint" },
        dataType: "number",
        initialValue: 10,
        generator: { type: "manual" },
        readable: true,
        writable: true
      }
    ]
  });
}

describe("simulator adapter", () => {
  it("uses lifecycle, managed subscriptions, fake time, reads, and writes", async () => {
    const scheduler = new ManualScheduler();
    const simulator = fixture(scheduler);
    const values: number[] = [];
    const subscription = await simulator.subscribe(
      { addresses: [address], samplingIntervalMs: 100 },
      (event) => {
        if (event.type === "VALUE") values.push(event.value.value as number);
      }
    );
    expect(subscription.closed).toBe(false);
    await simulator.connect();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    scheduler.advance(0);
    expect(subscription.closed).toBe(false);
    expect(values).toEqual([0]);
    scheduler.advance(100);
    expect(values).toEqual([0, 2]);
    expect((await simulator.read({ addresses: [address] })).values[0]?.value).toBe(2);
    const write = await simulator.write({
      items: [{ address: { sourceId: "sim", key: "setpoint" }, value: 25 }]
    });
    expect(write.results[0]?.ok).toBe(true);
    await simulator.disconnect();
    expect(scheduler.pending).toBe(0);
    await simulator.dispose();
    await simulator.dispose();
    expect(simulator.getStatus().state).toBe("disposed");
  });

  it("validates definitions and produces identical seeded random values", async () => {
    const make = (scheduler: ManualScheduler): SimulatorDataSource =>
      createSimulatorDataSource({
        identity: { id: "random", type: "simulator" },
        scheduler,
        seed: 9,
        points: [
          {
            address: { sourceId: "random", key: "value" },
            dataType: "number",
            initialValue: 0,
            generator: { type: "random-range", minimum: 0, maximum: 1 },
            updateIntervalMs: 10
          }
        ]
      });
    const leftScheduler = new ManualScheduler();
    const rightScheduler = new ManualScheduler();
    const left = make(leftScheduler);
    const right = make(rightScheduler);
    await left.connect();
    await right.connect();
    leftScheduler.advance(10);
    rightScheduler.advance(10);
    expect(left.control.getPoint({ sourceId: "random", key: "value" })?.value).toBe(
      right.control.getPoint({ sourceId: "random", key: "value" })?.value
    );
    expect(() =>
      createSimulatorDataSource({
        identity: { id: "bad", type: "simulator" },
        points: [
          {
            address: { sourceId: "other", key: "x" },
            dataType: "number",
            initialValue: 0,
            generator: { type: "sine", minimum: 2, maximum: 1, periodMs: 10 }
          }
        ]
      })
    ).toThrow(/sourceId|bounds/);
  });
});
