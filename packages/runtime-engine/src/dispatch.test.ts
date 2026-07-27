import { describe, expect, it, vi } from "vitest";
import type { RuntimeFrameDriver } from "./contracts.js";
import { RuntimeDispatcher, RuntimeFrameScheduler, RuntimeUpdateQueue } from "./dispatch.js";
import { RuntimeEventBus } from "./events.js";

class ManualFrameDriver implements RuntimeFrameDriver {
  public callback: ((timestamp: number) => void) | undefined;
  public requestFrame(callback: (timestamp: number) => void): number {
    this.callback = callback;
    return 1;
  }
  public cancelFrame(): void {
    this.callback = undefined;
  }
  public flush(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.(100);
  }
}

describe("RuntimeUpdateQueue", () => {
  it("merges symbols in insertion order with latest properties winning", () => {
    const queue = new RuntimeUpdateQueue();
    queue.enqueue({ symbolId: "pump", properties: { speed: 10, enabled: true } });
    queue.enqueue({ symbolId: "valve", state: "active" });
    queue.enqueue({ symbolId: "pump", properties: { speed: 20 }, state: "running" });
    expect(queue.size()).toBe(2);
    expect(queue.flush()).toEqual([
      {
        symbolId: "pump",
        properties: { speed: 20, enabled: true },
        state: "running"
      },
      { symbolId: "valve", state: "active" }
    ]);
    expect(queue.isEmpty()).toBe(true);
  });
});

describe("RuntimeDispatcher", () => {
  it("coalesces a burst into one frame and emits a typed event", () => {
    const driver = new ManualFrameDriver();
    const scheduler = new RuntimeFrameScheduler(driver);
    const events = new RuntimeEventBus();
    const listener = vi.fn();
    events.on("RuntimeUpdated", listener);
    const dispatch = vi.fn();
    const dispatcher = new RuntimeDispatcher({ dispatch, scheduler, events, now: () => 100 });
    dispatcher.enqueue({ symbolId: "pump", properties: { speed: 10 } });
    dispatcher.enqueue({ symbolId: "pump", properties: { speed: 20 } });
    expect(dispatch).not.toHaveBeenCalled();
    driver.flush();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0]).toEqual([{ symbolId: "pump", properties: { speed: 20 } }]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("queues reentrant work for a later frame", () => {
    const driver = new ManualFrameDriver();
    const scheduler = new RuntimeFrameScheduler(driver);
    const holder: { dispatcher?: RuntimeDispatcher } = {};
    const dispatch = vi.fn(() => {
      holder.dispatcher?.enqueue({ symbolId: "later" });
    });
    const dispatcher = new RuntimeDispatcher({ dispatch, scheduler });
    holder.dispatcher = dispatcher;
    dispatcher.enqueue({ symbolId: "first" });
    driver.flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    driver.flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    dispatcher.dispose();
  });
});

describe("RuntimeEventBus", () => {
  it("supports idempotent unsubscribe and isolates listener failures", () => {
    const bus = new RuntimeEventBus();
    bus.on("SimulationStarted", () => {
      throw new Error("observer failure");
    });
    const listener = vi.fn();
    const subscription = bus.on("SimulationStarted", listener);
    bus.emit("SimulationStarted", { timestamp: 1 });
    expect(listener).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    subscription.unsubscribe();
    bus.emit("SimulationStarted", { timestamp: 2 });
    expect(listener).toHaveBeenCalledOnce();
    const remaining = bus.on("SimulationStopped", () => undefined);
    bus.dispose();
    expect(remaining.closed).toBe(true);
  });
});
