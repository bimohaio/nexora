export interface DataSourceScheduledTask {
  readonly cancelled: boolean;
  cancel(): void;
}

export interface DataSourceScheduler {
  now(): number;
  schedule(delayMs: number, task: () => void): DataSourceScheduledTask;
}

class TimerTask implements DataSourceScheduledTask {
  #cancelled = false;

  public constructor(private readonly cancelTimer: () => void) {}

  public get cancelled(): boolean {
    return this.#cancelled;
  }

  public cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.cancelTimer();
  }
}

export class SystemDataSourceScheduler implements DataSourceScheduler {
  public now(): number {
    return Date.now();
  }

  public schedule(delayMs: number, task: () => void): DataSourceScheduledTask {
    assertDelay(delayMs);
    let handle: ReturnType<typeof setTimeout> | undefined = setTimeout(task, delayMs);
    return new TimerTask(() => {
      if (handle !== undefined) clearTimeout(handle);
      handle = undefined;
    });
  }
}

export function assertDelay(delayMs: number, name = "delayMs"): void {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
}
