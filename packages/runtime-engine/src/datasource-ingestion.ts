import type {
  DataPointAddress,
  DataQuality as ExternalQuality,
  DataSourceAdapter,
  DataSourceEvent,
  DataSourceScheduledTask,
  DataSourceScheduler,
  SubscriptionHandle,
  SubscriptionRequest
} from "@web-scada/datasource-core";
import { dataPointAddressKey, normalizeAddress } from "@web-scada/datasource-core";
import type {
  DataQuality,
  MutableTagStore,
  RuntimeBatchResult,
  RuntimeDataPointInput,
  RuntimeQualityDetail
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";

export interface DataSourceRuntimeMapping {
  readonly address: DataPointAddress;
  readonly runtimeKey: string;
}

export interface RuntimeExternalValueTarget {
  updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult;
}

export interface RuntimeIngestionDiagnostic {
  readonly code: "RUNTIME_DATASOURCE_UNMAPPED" | "RUNTIME_DATASOURCE_INGESTION_ERROR";
  readonly message: string;
  readonly address?: DataPointAddress;
}

export interface DataSourceRuntimeIngestionOptions {
  readonly target: RuntimeExternalValueTarget | MutableTagStore;
  readonly mappings: readonly DataSourceRuntimeMapping[];
  readonly onDiagnostic?: (diagnostic: Readonly<RuntimeIngestionDiagnostic>) => void;
}

export interface DataSourceRuntimeIngestion {
  ingest(event: Readonly<DataSourceEvent>): RuntimeBatchResult | undefined;
  ingestMany(events: readonly Readonly<DataSourceEvent>[]): RuntimeBatchResult | undefined;
}

export function createDataSourceRuntimeIngestion(
  options: Readonly<DataSourceRuntimeIngestionOptions>
): DataSourceRuntimeIngestion {
  const mappings = validateMappings(options.mappings);
  const unmapped = new Set<string>();
  const convert = (event: Readonly<DataSourceEvent>): RuntimeDataPointInput | undefined => {
    if (event.type !== "VALUE") return undefined;
    const addressKey = dataPointAddressKey(event.value.address);
    const key = mappings.get(addressKey);
    if (key === undefined) {
      if (!unmapped.has(addressKey)) {
        unmapped.add(addressKey);
        options.onDiagnostic?.({
          code: "RUNTIME_DATASOURCE_UNMAPPED",
          message: "A data-source value has no runtime mapping.",
          address: event.value.address
        });
      }
      return undefined;
    }
    const quality = mapQuality(event.value.quality);
    return Object.freeze({
      key,
      value: event.value.value,
      quality: quality.quality,
      ...(quality.detail === undefined ? {} : { qualityDetail: quality.detail }),
      timestamp: event.value.sourceTimestamp ?? event.value.receivedTimestamp,
      source: event.adapter.id,
      ...(event.value.sequence === undefined ? {} : { sequence: event.value.sequence }),
      ...(event.value.metadata === undefined ? {} : { metadata: event.value.metadata })
    });
  };
  return Object.freeze({
    ingest(event: Readonly<DataSourceEvent>): RuntimeBatchResult | undefined {
      const input = convert(event);
      return input === undefined ? undefined : options.target.updateMany([input]);
    },
    ingestMany(events: readonly Readonly<DataSourceEvent>[]): RuntimeBatchResult | undefined {
      const byKey = new Map<string, RuntimeDataPointInput>();
      for (const event of events) {
        const input = convert(event);
        if (input !== undefined) byKey.set(input.key, input);
      }
      return byKey.size === 0
        ? undefined
        : options.target.updateMany([...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)));
    }
  });
}

export type DataSourceRuntimeBridgeState =
  "created" | "starting" | "running" | "stopping" | "stopped" | "failed" | "disposed";

export interface DataSourceRuntimeBridgeOptions {
  readonly adapter: DataSourceAdapter;
  readonly subscriptions: readonly SubscriptionRequest[];
  readonly ingestion: DataSourceRuntimeIngestion;
  readonly scheduler: DataSourceScheduler;
  /** Owned adapters are disconnected and disposed with the bridge. Default: borrowed. */
  readonly adapterOwnership?: "owned" | "borrowed";
  readonly disconnectOnStop?: boolean;
  readonly onDiagnostic?: (diagnostic: Readonly<RuntimeIngestionDiagnostic>) => void;
}

export interface DataSourceRuntimeBridge {
  readonly state: DataSourceRuntimeBridgeState;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export function createDataSourceRuntimeBridge(
  options: Readonly<DataSourceRuntimeBridgeOptions>
): DataSourceRuntimeBridge {
  return new RuntimeBridge(options);
}

class RuntimeBridge implements DataSourceRuntimeBridge {
  readonly #options: Readonly<DataSourceRuntimeBridgeOptions>;
  readonly #handles: SubscriptionHandle[] = [];
  readonly #pending: DataSourceEvent[] = [];
  #flushTask: DataSourceScheduledTask | undefined;
  #generation = 0;
  #state: DataSourceRuntimeBridgeState = "created";
  #startPromise: Promise<void> | undefined;

  public constructor(options: Readonly<DataSourceRuntimeBridgeOptions>) {
    if (options.subscriptions.length === 0)
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Runtime bridge requires at least one subscription."
      );
    this.#options = options;
  }
  public get state(): DataSourceRuntimeBridgeState {
    return this.#state;
  }
  public start(): Promise<void> {
    if (this.#state === "disposed")
      return Promise.reject(
        new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime bridge is disposed.")
      );
    if (this.#state === "running") return Promise.resolve();
    if (this.#startPromise) return this.#startPromise;
    const generation = ++this.#generation;
    this.#state = "starting";
    const work = (async () => {
      await this.#options.adapter.connect();
      if (generation !== this.#generation) return;
      for (const request of this.#options.subscriptions) {
        const handle = await this.#options.adapter.subscribe(request, (event) => {
          if (
            generation !== this.#generation ||
            (this.#state !== "running" && this.#state !== "starting")
          )
            return;
          this.#pending.push(event);
          this.#scheduleFlush(generation);
        });
        if (generation !== this.#generation) await handle.unsubscribe();
        else this.#handles.push(handle);
      }
      if (generation === this.#generation) this.#state = "running";
    })()
      .catch((error: unknown) => {
        if (generation === this.#generation) this.#state = "failed";
        throw error;
      })
      .finally(() => {
        if (this.#startPromise === work) this.#startPromise = undefined;
      });
    this.#startPromise = work;
    return work;
  }
  public async stop(): Promise<void> {
    if (this.#state === "disposed" || this.#state === "stopped" || this.#state === "created") {
      if (this.#state === "created") this.#state = "stopped";
      return;
    }
    this.#state = "stopping";
    ++this.#generation;
    this.#flushTask?.cancel();
    this.#flushTask = undefined;
    this.#pending.length = 0;
    const handles = this.#handles.splice(0);
    for (const handle of handles) await handle.unsubscribe();
    if (this.#options.disconnectOnStop === true || this.#options.adapterOwnership === "owned")
      await this.#options.adapter.disconnect();
    this.#state = "stopped";
  }
  public async dispose(): Promise<void> {
    if (this.#state === "disposed") return;
    await this.stop();
    if (this.#options.adapterOwnership === "owned") await this.#options.adapter.dispose();
    this.#state = "disposed";
  }
  #scheduleFlush(generation: number): void {
    if (this.#flushTask !== undefined) return;
    this.#flushTask = this.#options.scheduler.schedule(0, () => {
      this.#flushTask = undefined;
      if (generation !== this.#generation || this.#state !== "running") return;
      const events = this.#pending.splice(0);
      try {
        this.#options.ingestion.ingestMany(events);
      } catch {
        this.#options.onDiagnostic?.({
          code: "RUNTIME_DATASOURCE_INGESTION_ERROR",
          message: "A data-source batch could not be ingested."
        });
      }
    });
  }
}

function validateMappings(
  mappings: readonly DataSourceRuntimeMapping[]
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const runtimeKeys = new Set<string>();
  for (const mapping of mappings) {
    const address = normalizeAddress(mapping.address);
    const addressKey = dataPointAddressKey(address);
    if (
      mapping.runtimeKey.trim() === "" ||
      result.has(addressKey) ||
      runtimeKeys.has(mapping.runtimeKey)
    )
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Runtime data-source mappings must have unique, non-empty keys and addresses."
      );
    result.set(addressKey, mapping.runtimeKey);
    runtimeKeys.add(mapping.runtimeKey);
  }
  return result;
}

function mapQuality(quality: ExternalQuality): {
  readonly quality: DataQuality;
  readonly detail?: RuntimeQualityDetail;
} {
  const mapped: DataQuality =
    quality.level === "GOOD"
      ? "good"
      : quality.level === "UNCERTAIN"
        ? "uncertain"
        : quality.level === "BAD"
          ? "bad"
          : "unknown";
  const detail =
    quality.reason === undefined || quality.reason === "GOOD" || quality.reason === "UNKNOWN"
      ? undefined
      : quality.reason.toLowerCase().replaceAll("_", "-");
  return { quality: mapped, ...(detail === undefined ? {} : { detail }) };
}
