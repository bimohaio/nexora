import { SchedulerError } from "../errors/index.js";
import type { InteractionScheduler } from "../types/index.js";
import type {
  InteractionPriority,
  ScheduledInteractionWork,
  SchedulerTimingAdapter,
  SchedulingMode
} from "../types/performance.js";

const PRIORITY: Readonly<Record<InteractionPriority, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  idle: 4
};
interface QueueEntry {
  readonly sequence: number;
  readonly work: ScheduledInteractionWork;
  canceled: boolean;
}

export function createDefaultTimingAdapter(): SchedulerTimingAdapter {
  const frameHost = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const timeout = (task: () => void, delay = 0): { cancel(): void } => {
    const handle = setTimeout(task, delay);
    return {
      cancel: () => {
        clearTimeout(handle);
      }
    };
  };
  return {
    frame: (task) => {
      if (frameHost.requestAnimationFrame === undefined) return timeout(task);
      const handle = frameHost.requestAnimationFrame(task);
      return { cancel: () => frameHost.cancelAnimationFrame?.(handle) };
    },
    microtask: (task) => {
      let canceled = false;
      queueMicrotask(() => {
        if (!canceled) task();
      });
      return {
        cancel: () => {
          canceled = true;
        }
      };
    },
    macrotask: (task) => timeout(task),
    idle: (task) => timeout(task, 1),
    now: () => performance.now()
  };
}

export interface InteractionPerformanceSchedulerOptions {
  readonly timing?: SchedulerTimingAdapter;
  readonly frameBudgetMs?: number;
  readonly onFrame?: (duration: number, queueLength: number) => void;
}

export class InteractionPerformanceScheduler implements InteractionScheduler {
  readonly #timing: SchedulerTimingAdapter;
  readonly #budget: number;
  readonly #onFrame: ((duration: number, queueLength: number) => void) | undefined;
  readonly #queue: QueueEntry[] = [];
  readonly #coalesced = new Map<string, QueueEntry>();
  readonly #obsolete = new Map<string, Set<QueueEntry>>();
  #scheduled: { cancel(): void } | undefined;
  #sequence = 0;
  #disposed = false;

  public constructor(options: InteractionPerformanceSchedulerOptions = {}) {
    this.#timing = options.timing ?? createDefaultTimingAdapter();
    this.#budget = options.frameBudgetMs ?? 16;
    if (!Number.isFinite(this.#budget) || this.#budget <= 0)
      throw new SchedulerError("SCHEDULER_BUDGET_INVALID", "Frame budget must be positive.");
    this.#onFrame = options.onFrame;
  }
  public get queueLength(): number {
    return this.#queue.reduce((count, entry) => count + (entry.canceled ? 0 : 1), 0);
  }
  public schedule(task: () => void): { cancel(): void } {
    return this.scheduleWork({
      id: `work-${String(++this.#sequence)}`,
      mode: "frame",
      execute: task
    });
  }
  public scheduleWork(work: ScheduledInteractionWork): { cancel(): void } {
    this.#assertUsable();
    if (work.id.trim() === "")
      throw new SchedulerError("SCHEDULER_WORK_INVALID", "Scheduled work requires an ID.");
    const existing =
      work.coalesceKey === undefined ? undefined : this.#coalesced.get(work.coalesceKey);
    if (existing !== undefined) existing.canceled = true;
    if (work.obsoleteKey !== undefined) {
      for (const entry of this.#obsolete.get(work.obsoleteKey) ?? []) entry.canceled = true;
      this.#obsolete.set(work.obsoleteKey, new Set());
    }
    const entry: QueueEntry = { sequence: ++this.#sequence, work, canceled: false };
    this.#queue.push(entry);
    if (work.coalesceKey !== undefined) this.#coalesced.set(work.coalesceKey, entry);
    if (work.obsoleteKey !== undefined) {
      const entries = this.#obsolete.get(work.obsoleteKey) ?? new Set();
      entries.add(entry);
      this.#obsolete.set(work.obsoleteKey, entries);
    }
    this.#ensureScheduled(work.mode ?? "frame");
    return {
      cancel: () => {
        entry.canceled = true;
      }
    };
  }
  public flush(): void {
    this.#assertUsable();
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    const started = this.#timing.now();
    this.#queue.sort(
      (left, right) =>
        PRIORITY[left.work.priority ?? "normal"] - PRIORITY[right.work.priority ?? "normal"] ||
        left.sequence - right.sequence
    );
    while (this.#queue.length > 0) {
      const entry = this.#queue.shift();
      if (entry === undefined || entry.canceled) continue;
      this.#removeIndexes(entry);
      entry.work.execute();
      if (entry.work.priority !== "critical" && this.#timing.now() - started >= this.#budget) break;
    }
    const duration = Math.max(0, this.#timing.now() - started);
    this.#onFrame?.(duration, this.queueLength);
    if (this.queueLength > 0) this.#ensureScheduled("frame");
  }
  public cancelAll(): void {
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    this.#queue.length = 0;
    this.#coalesced.clear();
    this.#obsolete.clear();
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.cancelAll();
    this.#disposed = true;
  }
  #ensureScheduled(mode: SchedulingMode): void {
    if (this.#scheduled !== undefined) return;
    const run = (): void => {
      this.#scheduled = undefined;
      this.flush();
    };
    this.#scheduled =
      mode === "microtask"
        ? this.#timing.microtask(run)
        : mode === "macrotask"
          ? this.#timing.macrotask(run)
          : mode === "idle"
            ? (this.#timing.idle?.(run) ?? this.#timing.macrotask(run))
            : this.#timing.frame(run);
  }
  #removeIndexes(entry: QueueEntry): void {
    if (
      entry.work.coalesceKey !== undefined &&
      this.#coalesced.get(entry.work.coalesceKey) === entry
    )
      this.#coalesced.delete(entry.work.coalesceKey);
    if (entry.work.obsoleteKey !== undefined)
      this.#obsolete.get(entry.work.obsoleteKey)?.delete(entry);
  }
  #assertUsable(): void {
    if (this.#disposed) throw new SchedulerError("SCHEDULER_DISPOSED", "Scheduler is disposed.");
  }
}
