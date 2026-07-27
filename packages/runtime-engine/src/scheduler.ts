import type {
  RuntimeDiagnostic,
  RuntimeScheduledTask,
  RuntimeScheduler,
  RuntimeTaskScheduler
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";

class ScheduledTask implements RuntimeScheduledTask {
  #canceled = false;

  public constructor(private readonly onCancel: () => void) {}

  public get canceled(): boolean {
    return this.#canceled;
  }

  public cancel(): void {
    if (this.#canceled) return;
    this.#canceled = true;
    this.onCancel();
  }
}

export class ImmediateRuntimeScheduler implements RuntimeTaskScheduler {
  #disposed = false;

  public get disposed(): boolean {
    return this.#disposed;
  }

  public schedule(task: () => void): RuntimeScheduledTask {
    this.#assertUsable();
    const scheduled = new ScheduledTask(() => undefined);
    task();
    return scheduled;
  }

  public dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime scheduler is disposed.");
  }
}

export interface ManualRuntimeSchedulerOptions {
  readonly onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
  readonly now?: () => number;
}

export class ManualRuntimeScheduler implements RuntimeTaskScheduler, RuntimeScheduler {
  readonly #tasks = new Map<
    number,
    { readonly task: () => void; readonly handle: ScheduledTask }
  >();
  readonly #onDiagnostic: ManualRuntimeSchedulerOptions["onDiagnostic"];
  readonly #now: () => number;
  #nextId = 0;
  #disposed = false;

  public constructor(options: ManualRuntimeSchedulerOptions = {}) {
    this.#onDiagnostic = options.onDiagnostic;
    this.#now = options.now ?? (() => Date.now());
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get pendingCount(): number {
    return this.#tasks.size;
  }

  public now(): number {
    return this.#now();
  }

  public schedule(task: () => void): RuntimeScheduledTask {
    this.#assertUsable();
    const id = this.#nextId;
    this.#nextId += 1;
    const handle = new ScheduledTask(() => {
      this.#tasks.delete(id);
    });
    this.#tasks.set(id, { task, handle });
    return handle;
  }

  public flush(): void {
    this.#assertUsable();
    const tasks = [...this.#tasks.entries()].sort(([left], [right]) => left - right);
    this.#tasks.clear();
    for (const [, entry] of tasks) {
      if (entry.handle.canceled) continue;
      try {
        entry.task();
      } catch {
        this.#onDiagnostic?.(
          Object.freeze({
            code: "RUNTIME_SCHEDULER_ERROR",
            severity: "error",
            message: "A scheduled runtime task failed.",
            recoverable: true,
            timestamp: new Date(this.#now()).toISOString(),
            context: Object.freeze({})
          })
        );
      }
    }
  }

  public flushAll(): void {
    this.flush();
  }

  public flushOne(): void {
    this.#assertUsable();
    const first = [...this.#tasks.entries()].sort(([left], [right]) => left - right)[0];
    if (first === undefined) return;
    const [id, entry] = first;
    this.#tasks.delete(id);
    if (!entry.handle.canceled) entry.task();
  }

  public setTimeout(callback: () => void, _delayMs: number): unknown {
    return this.schedule(callback);
  }

  public clearTimeout(handle: unknown): void {
    if (handle instanceof ScheduledTask) handle.cancel();
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const { handle } of this.#tasks.values()) handle.cancel();
    this.#tasks.clear();
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime scheduler is disposed.");
  }
}
