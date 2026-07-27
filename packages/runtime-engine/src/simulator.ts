import type {
  DataQuality,
  RuntimeBatchResult,
  RuntimeDataPointInput,
  RuntimeLifecycleStatus,
  RuntimeScheduler
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import type { RuntimeEventBus } from "./events.js";

export interface RuntimeUpdateSink {
  updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult;
}

export interface RuntimeSimulatorScenarioContext {
  readonly tick: number;
  readonly now: number;
  readonly random: number;
}

export type RuntimeSimulatorScenario = (
  context: Readonly<RuntimeSimulatorScenarioContext>
) => readonly Readonly<RuntimeDataPointInput>[];

export interface RuntimeSimulatorOptions {
  readonly sink: RuntimeUpdateSink;
  readonly scenario?: RuntimeSimulatorScenario;
  readonly scheduler?: RuntimeScheduler;
  readonly intervalMs?: number;
  readonly seed?: number;
  readonly source?: string;
  readonly events?: RuntimeEventBus;
}

export interface RuntimeSimulatorTickResult {
  readonly tick: number;
  readonly emitted: number;
  readonly batch: RuntimeBatchResult;
}

export interface RuntimeSimulator {
  readonly running: boolean;
  readonly paused: boolean;
  readonly disposed: boolean;
  readonly tickCount: number;
  readonly speed: number;
  readonly status: RuntimeLifecycleStatus;
  initialize(): void;
  start(): void;
  pause(): void;
  resume(): void;
  setSpeed(multiplier: number): void;
  stop(): void;
  reset(): void;
  tick(): RuntimeSimulatorTickResult;
  dispose(): void;
}

export type RuntimeValueGenerator = (context: Readonly<RuntimeSimulatorScenarioContext>) => unknown;

export const booleanValue =
  (value: boolean): RuntimeValueGenerator =>
  () =>
    value;
export const numberValue =
  (value: number): RuntimeValueGenerator =>
  () =>
    value;
export const analogValue = (
  minimum: number,
  maximum: number,
  periodTicks = 100
): RuntimeValueGenerator => {
  if (maximum < minimum || !Number.isFinite(periodTicks) || periodTicks <= 0)
    throw new TypeError("Invalid analog generator range or period.");
  return ({ tick }) => {
    const phase = (tick % periodTicks) / periodTicks;
    return minimum + (maximum - minimum) * (phase < 0.5 ? phase * 2 : (1 - phase) * 2);
  };
};
export const randomValue = (minimum = 0, maximum = 1): RuntimeValueGenerator => {
  if (maximum < minimum) throw new TypeError("Invalid random generator range.");
  return ({ random }) => minimum + random * (maximum - minimum);
};
export const sineWave = (
  minimum: number,
  maximum: number,
  periodTicks = 100
): RuntimeValueGenerator => {
  if (maximum < minimum || !Number.isFinite(periodTicks) || periodTicks <= 0)
    throw new TypeError("Invalid sine generator range or period.");
  const midpoint = (minimum + maximum) / 2;
  const amplitude = (maximum - minimum) / 2;
  return ({ tick }) => midpoint + amplitude * Math.sin((tick / periodTicks) * Math.PI * 2);
};
export const squareWave = (
  low: number | boolean,
  high: number | boolean,
  periodTicks = 2
): RuntimeValueGenerator => {
  if (!Number.isFinite(periodTicks) || periodTicks <= 0)
    throw new TypeError("Invalid square-wave period.");
  return ({ tick }) => (tick % periodTicks < periodTicks / 2 ? high : low);
};
export const incrementalCounter =
  (initial = 0, step = 1, maximum?: number): RuntimeValueGenerator =>
  ({ tick }) => {
    const value = initial + tick * step;
    if (maximum === undefined) return value;
    const span = maximum - initial + step;
    return span <= 0 ? value : initial + ((value - initial) % span);
  };

export function createGeneratorScenario(
  generators: Readonly<Record<string, RuntimeValueGenerator>>
): RuntimeSimulatorScenario {
  const entries = Object.entries(generators);
  return (context) =>
    entries.map(([key, generate]) => ({
      key,
      value: generate(context),
      timestamp: context.now,
      sequence: context.tick
    }));
}

const SYSTEM_SCHEDULER: RuntimeScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function qualityForTick(tick: number): {
  readonly quality: DataQuality;
  readonly qualityDetail?: Exclude<RuntimeDataPointInput["qualityDetail"], undefined>;
} {
  const phase = tick % 30;
  if (phase >= 25)
    return phase === 29 ? { quality: "good" } : { quality: "bad", qualityDetail: "disconnected" };
  if (phase >= 20) return { quality: "uncertain", qualityDetail: "stale" };
  return { quality: "good" };
}

export const industrialRuntimeScenario: RuntimeSimulatorScenario = ({ tick, now, random }) => {
  const cycle = tick % 40;
  const rising = cycle < 20;
  const level = rising ? 30 + cycle * 3 : 90 - (cycle - 20) * 3;
  const pumpRunning = level >= 60;
  const valveOpen = level <= 75;
  const quality = qualityForTick(tick);
  const common: Pick<RuntimeDataPointInput, "quality" | "timestamp" | "sequence"> &
    Partial<Pick<RuntimeDataPointInput, "qualityDetail">> = {
    quality: quality.quality,
    timestamp: now,
    sequence: tick,
    ...(quality.qualityDetail === undefined ? {} : { qualityDetail: quality.qualityDetail })
  };
  return [
    { key: "process.area-a.tank-t101.level", value: level, ...common },
    { key: "process.area-a.pump-p101.running", value: pumpRunning, ...common },
    {
      key: "process.area-a.pump-p101.speed",
      value: pumpRunning ? Math.round(1_350 + random * 150) : 0,
      ...common
    },
    { key: "process.area-a.valve-v101.open", value: valveOpen, ...common },
    {
      key: "process.area-a.sensor-pt101.pressure",
      value: pumpRunning ? Math.round((3.5 + random * 0.4) * 100) / 100 : 0.2,
      ...common
    },
    {
      key: "process.area-a.sensor-tt101.temperature",
      value: Math.round((21 + Math.sin(tick / 8) * 2) * 10) / 10,
      ...common
    },
    {
      key: "process.area-a.connection-c101.active",
      value: pumpRunning && valveOpen,
      ...common
    }
  ];
};

export class DeterministicRuntimeSimulator implements RuntimeSimulator {
  readonly #sink: RuntimeUpdateSink;
  readonly #scenario: RuntimeSimulatorScenario;
  readonly #scheduler: RuntimeScheduler;
  readonly #intervalMs: number;
  readonly #seed: number;
  readonly #source: string;
  readonly #events: RuntimeEventBus | undefined;
  #random: () => number;
  #timer: unknown;
  #running = false;
  #paused = false;
  #disposed = false;
  #tickCount = 0;
  #speed = 1;
  #initialized = false;

  public constructor(options: RuntimeSimulatorOptions) {
    const intervalMs = options.intervalMs ?? 250;
    const seed = options.seed ?? 1;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0)
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Simulator interval must be a positive finite number."
      );
    if (!Number.isSafeInteger(seed))
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Simulator seed must be a safe integer."
      );
    this.#sink = options.sink;
    this.#scenario = options.scenario ?? industrialRuntimeScenario;
    this.#scheduler = options.scheduler ?? SYSTEM_SCHEDULER;
    this.#intervalMs = intervalMs;
    this.#seed = seed;
    this.#source = options.source ?? "runtime-simulator";
    this.#events = options.events;
    this.#random = createRandom(seed);
  }

  public get running(): boolean {
    return this.#running;
  }

  public get paused(): boolean {
    return this.#paused;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get tickCount(): number {
    return this.#tickCount;
  }

  public get speed(): number {
    return this.#speed;
  }

  public get status(): RuntimeLifecycleStatus {
    if (this.#disposed) return "disposed";
    if (!this.#running) return this.#initialized ? "stopped" : "idle";
    return this.#paused ? "paused" : "running";
  }

  public initialize(): void {
    this.#assertUsable();
    this.#initialized = true;
  }

  public start(): void {
    this.#assertUsable();
    this.initialize();
    if (this.#running && !this.#paused) return;
    this.#running = true;
    this.#paused = false;
    this.#events?.emit("SimulationStarted", { timestamp: this.#scheduler.now() });
    this.#schedule();
  }

  public pause(): void {
    this.#assertUsable();
    if (!this.#running || this.#paused) return;
    this.#paused = true;
    this.#clearTimer();
  }

  public resume(): void {
    this.#assertUsable();
    if (!this.#running) {
      this.start();
      return;
    }
    if (!this.#paused) return;
    this.#paused = false;
    this.#schedule();
  }

  public setSpeed(multiplier: number): void {
    this.#assertUsable();
    if (!Number.isFinite(multiplier) || multiplier <= 0)
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Simulator speed must be a positive finite multiplier."
      );
    if (this.#speed === multiplier) return;
    this.#speed = multiplier;
    if (this.#running && !this.#paused) {
      this.#clearTimer();
      this.#schedule();
    }
  }

  public stop(): void {
    this.#assertUsable();
    const wasRunning = this.#running;
    this.#running = false;
    this.#paused = false;
    this.#clearTimer();
    if (wasRunning) this.#events?.emit("SimulationStopped", { timestamp: this.#scheduler.now() });
  }

  public reset(): void {
    this.#assertUsable();
    this.#tickCount = 0;
    this.#random = createRandom(this.#seed);
  }

  public tick(): RuntimeSimulatorTickResult {
    this.#assertUsable();
    const tick = this.#tickCount;
    const now = this.#scheduler.now();
    if (!Number.isFinite(now))
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Simulator clock must return finite epoch milliseconds."
      );
    const inputs = this.#scenario({ tick, now, random: this.#random() }).map((input) => ({
      ...input,
      source: input.source ?? this.#source
    }));
    const batch = this.#sink.updateMany(inputs);
    this.#tickCount += 1;
    return Object.freeze({ tick, emitted: inputs.length, batch });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#clearTimer();
    this.#running = false;
    this.#paused = false;
    this.#disposed = true;
  }

  #schedule(): void {
    if (!this.#running || this.#paused || this.#timer !== undefined) return;
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = undefined;
      if (!this.#running || this.#paused || this.#disposed) return;
      this.tick();
      this.#schedule();
    }, this.#intervalMs / this.#speed);
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    this.#scheduler.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime simulator is disposed.");
  }
}

export function createRuntimeSimulator(options: RuntimeSimulatorOptions): RuntimeSimulator {
  return new DeterministicRuntimeSimulator(options);
}
