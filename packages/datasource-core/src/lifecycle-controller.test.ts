import { describe, expect, it, vi } from "vitest";
import {
  DataSourceError,
  createDataSourceLifecycleController,
  createExponentialReconnectPolicy,
  type DataSourceScheduledTask,
  type DataSourceScheduler
} from "./index.js";

class ManualScheduler implements DataSourceScheduler {
  #now = 100;
  readonly tasks: { at: number; callback: () => void; task: ManualTask }[] = [];
  public now(): number {
    return this.#now;
  }
  public schedule(delayMs: number, callback: () => void): DataSourceScheduledTask {
    const task = new ManualTask();
    this.tasks.push({ at: this.#now + delayMs, callback, task });
    return task;
  }
  public advance(delayMs: number): void {
    this.#now += delayMs;
    const ready = this.tasks.filter(({ at, task }) => at <= this.#now && !task.cancelled);
    for (const item of ready) {
      item.task.cancel();
      item.callback();
    }
  }
  public get pending(): number {
    return this.tasks.filter(({ task }) => !task.cancelled).length;
  }
}

class ManualTask implements DataSourceScheduledTask {
  public cancelled = false;
  public cancel(): void {
    this.cancelled = true;
  }
}

function deferred<T = void>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("data-source lifecycle controller", () => {
  it("coalesces connect calls and publishes immutable revisions", async () => {
    const pending = deferred();
    const connect = vi.fn(() => pending.promise);
    const scheduler = new ManualScheduler();
    const controller = createDataSourceLifecycleController({
      adapterId: "adapter",
      scheduler,
      reconnectPolicy: createExponentialReconnectPolicy({ enabled: false }),
      operations: { connect, disconnect: vi.fn(() => Promise.resolve()) }
    });
    const first = controller.connect();
    const second = controller.connect();
    expect(first).toBe(second);
    expect(connect).toHaveBeenCalledOnce();
    expect(controller.status).toMatchObject({ state: "connecting", revision: 1, changedAt: 100 });
    expect(Object.isFrozen(controller.status)).toBe(true);
    pending.resolve();
    await first;
    expect(controller.status).toMatchObject({ state: "connected", revision: 2 });
    await controller.connect();
    expect(connect).toHaveBeenCalledOnce();
  });

  it("invalidates a late connection when disconnect wins", async () => {
    const pending = deferred();
    const disconnect = vi.fn(() => Promise.resolve());
    const controller = createDataSourceLifecycleController({
      adapterId: "adapter",
      reconnectPolicy: createExponentialReconnectPolicy({ enabled: false }),
      operations: { connect: () => pending.promise, disconnect }
    });
    const connection = controller.connect();
    await controller.disconnect();
    pending.resolve();
    await connection;
    expect(controller.status.state).toBe("disconnected");
    expect(disconnect).toHaveBeenCalled();
  });

  it("schedules bounded retries and explicit disconnect cancels them", async () => {
    const scheduler = new ManualScheduler();
    const controller = createDataSourceLifecycleController({
      adapterId: "adapter",
      scheduler,
      reconnectPolicy: createExponentialReconnectPolicy({
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 20
      }),
      operations: {
        connect: vi.fn(() =>
          Promise.reject(
            new DataSourceError("DATASOURCE_CONNECTION_ERROR", "safe", {
              recoverable: true
            })
          )
        ),
        disconnect: vi.fn(() => Promise.resolve())
      }
    });
    await expect(controller.connect()).rejects.toMatchObject({
      code: "DATASOURCE_CONNECTION_ERROR"
    });
    expect(controller.status.nextReconnectAt).toBe(110);
    expect(scheduler.pending).toBe(1);
    await controller.disconnect();
    expect(scheduler.pending).toBe(0);
    scheduler.advance(100);
    expect(controller.status.state).toBe("disconnected");
  });

  it("times out, isolates listeners, and makes disposal terminal", async () => {
    const scheduler = new ManualScheduler();
    const diagnostics: string[] = [];
    const controller = createDataSourceLifecycleController({
      adapterId: "adapter",
      scheduler,
      connectTimeoutMs: 5,
      reconnectPolicy: createExponentialReconnectPolicy({ enabled: false }),
      onDiagnostic: ({ code }) => diagnostics.push(code),
      operations: {
        connect: () => new Promise(() => undefined),
        disconnect: vi.fn(() => Promise.resolve())
      }
    });
    controller.subscribeStatus(() => {
      throw new Error("consumer secret");
    });
    const connection = controller.connect();
    scheduler.advance(5);
    await expect(connection).rejects.toMatchObject({ code: "DATASOURCE_TIMEOUT" });
    expect(diagnostics).toContain("DATASOURCE_LISTENER_ERROR");
    await controller.dispose();
    await controller.dispose();
    expect(controller.status.state).toBe("disposed");
    expect(() => controller.connect()).toThrowError(DataSourceError);
  });

  it("calculates deterministic bounded jitter", () => {
    const policy = createExponentialReconnectPolicy({
      initialDelayMs: 10,
      maxDelayMs: 25,
      multiplier: 2,
      jitterRatio: 0.5,
      random: { next: () => 1 }
    });
    const error = new DataSourceError("DATASOURCE_CONNECTION_ERROR", "safe", {
      recoverable: true
    }).toJSON();
    expect(policy.getDelay({ attempt: 1, error })).toBe(15);
    expect(policy.getDelay({ attempt: 4, error })).toBe(25);
    expect(
      policy.shouldReconnect({
        attempt: 1,
        error: new DataSourceError("DATASOURCE_ACCESS_DENIED", "denied", {
          recoverable: true
        }).toJSON()
      })
    ).toBe(false);
  });
});
