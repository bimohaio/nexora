import type { JsonValue } from "@web-scada/core";
import type {
  RuntimeDispatchUpdate,
  RuntimeFrameDriver,
  RuntimeScheduledTask,
  RuntimeTaskScheduler
} from "./contracts.js";
import type { RuntimeEventBus } from "./events.js";

export type RuntimeDispatchMergeStrategy = (
  previous: RuntimeDispatchUpdate | undefined,
  next: RuntimeDispatchUpdate
) => RuntimeDispatchUpdate;

export function latestRuntimeDispatchUpdate(
  previous: RuntimeDispatchUpdate | undefined,
  next: RuntimeDispatchUpdate
): RuntimeDispatchUpdate {
  if (previous === undefined) return Object.freeze({ ...next });
  const properties =
    previous.properties === undefined && next.properties === undefined
      ? undefined
      : (Object.freeze({ ...previous.properties, ...next.properties }) as Readonly<
          Record<string, JsonValue>
        >);
  return Object.freeze({
    symbolId: next.symbolId,
    ...(properties === undefined ? {} : { properties }),
    ...(next.state === undefined
      ? previous.state === undefined
        ? {}
        : { state: previous.state }
      : { state: next.state }),
    ...(next.visible === undefined
      ? previous.visible === undefined
        ? {}
        : { visible: previous.visible }
      : { visible: next.visible }),
    ...(next.removed === undefined
      ? previous.removed === undefined
        ? {}
        : { removed: previous.removed }
      : { removed: next.removed })
  });
}

/** Ordered, symbol-keyed queue. The first insertion determines order; latest fields win. */
export class RuntimeUpdateQueue {
  readonly #updates = new Map<string, RuntimeDispatchUpdate>();
  public constructor(
    private readonly mergeStrategy: RuntimeDispatchMergeStrategy = latestRuntimeDispatchUpdate
  ) {}

  public enqueue(update: RuntimeDispatchUpdate): void {
    if (update.symbolId.trim() === "") throw new TypeError("Runtime update symbolId is required.");
    this.#updates.set(
      update.symbolId,
      this.mergeStrategy(this.#updates.get(update.symbolId), update)
    );
  }

  public enqueueMany(updates: readonly RuntimeDispatchUpdate[]): void {
    for (const update of updates) this.enqueue(update);
  }

  public clear(): void {
    this.#updates.clear();
  }

  public flush(): readonly RuntimeDispatchUpdate[] {
    if (this.#updates.size === 0) return Object.freeze([]);
    const updates = Object.freeze([...this.#updates.values()]);
    this.#updates.clear();
    return updates;
  }

  public size(): number {
    return this.#updates.size;
  }

  public isEmpty(): boolean {
    return this.#updates.size === 0;
  }
}

class FrameTask implements RuntimeScheduledTask {
  #canceled = false;
  public constructor(private readonly cancelTask: () => void) {}
  public get canceled(): boolean {
    return this.#canceled;
  }
  public cancel(): void {
    if (this.#canceled) return;
    this.#canceled = true;
    this.cancelTask();
  }
}

const BROWSER_FRAME_DRIVER: RuntimeFrameDriver = {
  requestFrame: (callback) =>
    (
      globalThis as unknown as {
        requestAnimationFrame: (handler: (timestamp: number) => void) => number;
      }
    ).requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    (
      globalThis as unknown as {
        cancelAnimationFrame: (frame: number) => void;
      }
    ).cancelAnimationFrame(handle as number);
  }
};

/** Coalesces every task scheduled before the next animation frame into one frame. */
export class RuntimeFrameScheduler implements RuntimeTaskScheduler {
  readonly #tasks: (() => void)[] = [];
  readonly #driver: RuntimeFrameDriver;
  #frame: unknown;
  #disposed = false;

  public constructor(driver: RuntimeFrameDriver = BROWSER_FRAME_DRIVER) {
    this.#driver = driver;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public schedule(task: () => void): RuntimeScheduledTask {
    if (this.#disposed) throw new Error("Runtime frame scheduler is disposed.");
    const entry = { task, active: true };
    this.#tasks.push(() => {
      if (entry.active) entry.task();
    });
    if (this.#frame === undefined)
      this.#frame = this.#driver.requestFrame(() => {
        this.#frame = undefined;
        const tasks = this.#tasks.splice(0);
        for (const queued of tasks) queued();
      });
    return new FrameTask(() => {
      entry.active = false;
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    if (this.#frame !== undefined) this.#driver.cancelFrame(this.#frame);
    this.#frame = undefined;
    this.#tasks.length = 0;
    this.#disposed = true;
  }
}

export interface RuntimeDispatcherOptions {
  readonly dispatch: (updates: readonly RuntimeDispatchUpdate[]) => void;
  readonly scheduler?: RuntimeTaskScheduler;
  readonly events?: RuntimeEventBus;
  readonly now?: () => number;
  readonly mergeStrategy?: RuntimeDispatchMergeStrategy;
  readonly onMetrics?: (metrics: {
    readonly dispatchDurationMs: number;
    readonly updateCount: number;
  }) => void;
}

/** SVG-independent update dispatcher with one delivery per scheduled frame. */
export class RuntimeDispatcher {
  readonly #queue: RuntimeUpdateQueue;
  readonly #scheduler: RuntimeTaskScheduler;
  readonly #ownsScheduler: boolean;
  readonly #dispatch: RuntimeDispatcherOptions["dispatch"];
  readonly #events: RuntimeEventBus | undefined;
  readonly #now: () => number;
  readonly #onMetrics: RuntimeDispatcherOptions["onMetrics"];
  #scheduled: RuntimeScheduledTask | undefined;
  #disposed = false;

  public constructor(options: RuntimeDispatcherOptions) {
    this.#dispatch = options.dispatch;
    this.#queue = new RuntimeUpdateQueue(options.mergeStrategy);
    this.#ownsScheduler = options.scheduler === undefined;
    this.#scheduler = options.scheduler ?? new RuntimeFrameScheduler();
    this.#events = options.events;
    this.#now = options.now ?? (() => Date.now());
    this.#onMetrics = options.onMetrics;
  }

  public enqueue(update: RuntimeDispatchUpdate): void {
    this.enqueueMany([update]);
  }

  public enqueueMany(updates: readonly RuntimeDispatchUpdate[]): void {
    if (this.#disposed) throw new Error("Runtime dispatcher is disposed.");
    this.#queue.enqueueMany(updates);
    if (this.#scheduled !== undefined) return;
    this.#scheduled = this.#scheduler.schedule(() => {
      this.#scheduled = undefined;
      this.flush();
    });
  }

  public flush(): void {
    if (this.#disposed || this.#queue.isEmpty()) return;
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    const updates = this.#queue.flush();
    const startedAt = this.#now();
    this.#dispatch(updates);
    this.#onMetrics?.({
      dispatchDurationMs: Math.max(0, this.#now() - startedAt),
      updateCount: updates.length
    });
    this.#events?.emit("RuntimeUpdated", { updates, timestamp: this.#now() });
  }

  public get size(): number {
    return this.#queue.size();
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    this.#queue.clear();
    if (this.#ownsScheduler) this.#scheduler.dispose();
    this.#disposed = true;
  }
}
