import type { JsonValue } from "@web-scada/core";
import type {
  DataProvider,
  DataProviderStatusEvent,
  DataQuality,
  RuntimeValue,
  TagStoreListener
} from "@web-scada/runtime-engine";

export class SimulatedProcessProvider implements DataProvider {
  readonly #statusListeners = new Set<(event: DataProviderStatusEvent) => void>();
  #listener: TagStoreListener | undefined;
  #tagIds = new Set<string>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #connected = false;
  #available = true;
  #alarm = false;
  #paused = false;
  #quality: DataQuality = "good";
  #tick = 0;

  public connect(): Promise<void> {
    if (!this.#available) return Promise.reject(new Error("Simulated provider is unavailable."));
    this.#connected = true;
    this.#emitStatus({ status: "connected" });
    return Promise.resolve();
  }

  public disconnect(): Promise<void> {
    this.#connected = false;
    this.#clearTimer();
    return Promise.resolve();
  }

  public subscribe(tagIds: readonly string[], listener: TagStoreListener): () => void {
    this.#tagIds = new Set(tagIds);
    this.#listener = listener;
    this.#emitValues();
    this.#startTimer();
    return () => {
      this.#listener = undefined;
      this.#clearTimer();
    };
  }

  public subscribeStatus(listener: (event: DataProviderStatusEvent) => void): () => void {
    this.#statusListeners.add(listener);
    return () => {
      this.#statusListeners.delete(listener);
    };
  }

  public setAvailable(available: boolean): void {
    this.#available = available;
    if (!available && this.#connected) {
      this.#connected = false;
      this.#clearTimer();
      this.#emitStatus({ status: "disconnected" });
    }
  }

  public setAlarm(alarm: boolean): void {
    this.#alarm = alarm;
    this.#emitValues();
  }

  public setQuality(quality: DataQuality): void {
    this.#quality = quality;
    this.#emitValues();
  }

  public setPaused(paused: boolean): void {
    this.#paused = paused;
    if (paused) this.#clearTimer();
    else {
      this.#emitValues();
      this.#startTimer();
    }
  }

  public get available(): boolean {
    return this.#available;
  }

  public get alarm(): boolean {
    return this.#alarm;
  }

  public get paused(): boolean {
    return this.#paused;
  }

  #emitValues(): void {
    if (!this.#connected || this.#paused || this.#listener === undefined) return;
    const timestamp = new Date().toISOString();
    const level = 0.5 + Math.sin(this.#tick / 3) * 0.32;
    const values: readonly RuntimeValue[] = [
      this.#value("process.tank.level", level, "number", timestamp),
      this.#value("process.pump.state", this.#alarm ? "alarm" : "running", "string", timestamp),
      this.#value(
        "process.indicator.state",
        this.#alarm ? "warning" : "active",
        "string",
        timestamp
      ),
      this.#value("process.pipe.color", this.#alarm ? "#ef4444" : "#38bdf8", "string", timestamp)
    ];
    for (const value of values) if (this.#tagIds.has(value.tagId)) this.#listener(value);
  }

  #value(
    tagId: string,
    value: JsonValue,
    dataType: RuntimeValue["dataType"],
    timestamp: string
  ): RuntimeValue {
    return { tagId, value, dataType, quality: this.#quality, timestamp };
  }

  #emitStatus(event: DataProviderStatusEvent): void {
    for (const listener of this.#statusListeners) listener(event);
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #startTimer(): void {
    this.#clearTimer();
    if (this.#paused || !this.#connected) return;
    this.#timer = setInterval(() => {
      this.#tick += 1;
      this.#emitValues();
    }, 750);
  }
}
