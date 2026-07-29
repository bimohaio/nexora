import { DataSourceError } from "@web-scada/datasource-core";

type Priority = "write" | "read" | "poll";
interface Job<T> {
  priority: Priority;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
export class ModbusRequestCoordinator {
  readonly #queues: Record<Priority, Job<unknown>[]> = { write: [], read: [], poll: [] };
  #running = false;
  #disposed = false;
  run<T>(priority: Priority, task: () => Promise<T>): Promise<T> {
    if (this.#disposed)
      return Promise.reject(
        new DataSourceError("DATASOURCE_DISPOSED", "Modbus request coordinator is disposed.")
      );
    return new Promise<T>((resolve, reject) => {
      this.#queues[priority].push({ priority, task, resolve, reject } as Job<unknown>);
      void this.#drain();
    });
  }
  dispose(): void {
    this.#disposed = true;
    const error = new DataSourceError(
      "DATASOURCE_DISPOSED",
      "Queued Modbus request was cancelled."
    );
    for (const queue of Object.values(this.#queues))
      for (const job of queue.splice(0)) job.reject(error);
  }
  async #drain(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (!this.#disposed) {
        const job =
          this.#queues.write.shift() ?? this.#queues.read.shift() ?? this.#queues.poll.shift();
        if (!job) break;
        try {
          job.resolve(await job.task());
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      this.#running = false;
    }
  }
}
