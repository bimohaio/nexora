import { describe, expect, it, vi } from "vitest";
import { RuntimeEventBus } from "./events.js";
import { RuntimeLifecycleManager } from "./lifecycle.js";

describe("RuntimeLifecycleManager", () => {
  it("implements deterministic initialize/start/pause/resume/stop/dispose transitions", async () => {
    const calls: string[] = [];
    const manager = new RuntimeLifecycleManager({
      hooks: {
        initialize: () => {
          calls.push("initialize");
        },
        start: () => {
          calls.push("start");
        },
        pause: () => {
          calls.push("pause");
        },
        resume: () => {
          calls.push("resume");
        },
        stop: () => {
          calls.push("stop");
        },
        dispose: () => {
          calls.push("dispose");
        }
      }
    });
    expect(manager.status).toBe("idle");
    await manager.start();
    expect(manager.status).toBe("running");
    await manager.pause();
    expect(manager.status).toBe("paused");
    await manager.resume();
    await manager.stop();
    expect(manager.status).toBe("stopped");
    await manager.dispose();
    await manager.dispose();
    expect(manager.status).toBe("disposed");
    expect(calls).toEqual(["initialize", "start", "pause", "resume", "stop", "dispose"]);
  });

  it("rejects illegal and overlapping transitions", async () => {
    let release: (() => void) | undefined;
    const manager = new RuntimeLifecycleManager({
      hooks: {
        initialize: () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      }
    });
    await expect(manager.pause()).rejects.toMatchObject({
      code: "RUNTIME_LIFECYCLE_INVALID"
    });
    const initialization = manager.initialize();
    await expect(manager.initialize()).rejects.toMatchObject({
      code: "RUNTIME_LIFECYCLE_INVALID"
    });
    release?.();
    await initialization;
  });

  it("disposes owned resources in reverse order and continues after cleanup failure", async () => {
    const order: string[] = [];
    const manager = new RuntimeLifecycleManager();
    manager.register({
      dispose: () => {
        order.push("first");
      }
    });
    manager.register({
      dispose: () => {
        order.push("second");
        throw new Error("cleanup failure");
      }
    });
    await expect(manager.dispose()).rejects.toThrow("cleanup failure");
    expect(order).toEqual(["second", "first"]);
    expect(manager.status).toBe("disposed");
    expect(manager.resourceCount).toBe(0);
  });

  it("emits strongly typed lifecycle events", async () => {
    const events = new RuntimeEventBus();
    const started = vi.fn();
    const paused = vi.fn();
    const resumed = vi.fn();
    const stopped = vi.fn();
    const disposed = vi.fn();
    events.on("RuntimeStarted", started);
    events.on("RuntimePaused", paused);
    events.on("RuntimeResumed", resumed);
    events.on("RuntimeStopped", stopped);
    events.on("RuntimeDisposed", disposed);
    const manager = new RuntimeLifecycleManager({ events, now: () => 42 });
    await manager.start();
    await manager.pause();
    await manager.resume();
    await manager.stop();
    await manager.dispose();
    for (const listener of [started, paused, resumed, stopped, disposed])
      expect(listener).toHaveBeenCalledWith({ timestamp: 42 });
  });
});
