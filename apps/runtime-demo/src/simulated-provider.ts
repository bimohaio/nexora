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
    const rawLevel = 0.62 + Math.sin(this.#tick / 8) * 0.24;
    const cleanLevel = 0.54 + Math.sin(this.#tick / 11 - 0.8) * 0.3;
    const flow = Math.max(0, 74 + Math.sin(this.#tick / 3) * 18);
    const pressure = 3.15 + Math.sin(this.#tick / 4) * 0.62;
    const temperature = 26.5 + Math.sin(this.#tick / 6) * 3.8;
    const highPressure = pressure > 3.65;
    const highTemperature = temperature > 29.5;
    const lowRawLevel = rawLevel < 0.43;
    const highCleanLevel = cleanLevel > 0.78;
    const processAlarm = this.#alarm || highPressure || highTemperature;
    const running = !processAlarm && !lowRawLevel && !highCleanLevel;
    const processState = processAlarm ? "alarm" : running ? "running" : "stopped";
    const valveState = processAlarm || highCleanLevel ? "inactive" : "active";
    const sensorState = (warning: boolean): string =>
      processAlarm ? "alarm" : warning ? "warning" : "active";
    const values: readonly RuntimeValue[] = [
      this.#value("process.raw-tank.level", rawLevel, "number", timestamp),
      this.#value("process.clean-tank.level", cleanLevel, "number", timestamp),
      this.#value("process.inlet-valve.state", valveState, "string", timestamp),
      this.#value("process.feed-pump.state", processState, "string", timestamp),
      this.#value("process.mixer.state", processState, "string", timestamp),
      this.#value("process.outlet-valve.state", valveState, "string", timestamp),
      this.#value("process.feed-motor.state", processState, "string", timestamp),
      this.#value("process.flow.state", sensorState(flow < 62), "string", timestamp),
      this.#value("process.pressure.state", sensorState(highPressure), "string", timestamp),
      this.#value("process.temperature.state", sensorState(highTemperature), "string", timestamp),
      this.#value("process.clean-level.state", sensorState(highCleanLevel), "string", timestamp),
      this.#value("control.plc.state", processAlarm ? "warning" : "running", "string", timestamp),
      this.#value("control.beacon.state", processAlarm ? "alarm" : "inactive", "string", timestamp),
      this.#value("process.flow.text", `${flow.toFixed(1)} m³/h`, "string", timestamp),
      this.#value("process.pressure.text", `${pressure.toFixed(2)} bar`, "string", timestamp),
      this.#value("process.temperature.text", `${temperature.toFixed(1)} °C`, "string", timestamp),
      this.#value(
        "process.clean-level.text",
        `${Math.round(cleanLevel * 100)} %`,
        "string",
        timestamp
      ),
      this.#value(
        "process.main-pipe.color",
        processAlarm ? "#ef4444" : running ? "#38bdf8" : "#64748b",
        "string",
        timestamp
      )
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
