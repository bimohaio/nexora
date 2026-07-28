import type {
  DataSourceEvent,
  DataSourceEventListener,
  SubscriptionHandle,
  SubscriptionRequest
} from "./contracts.js";
import { DataSourceError } from "./errors.js";
import type {
  DataSourceLifecycleController,
  DataSourceLifecycleStatus,
  StatusSubscription
} from "./lifecycle-controller.js";
import { dataPointAddressKey, normalizeAddress, normalizeMetadata } from "./normalization.js";
import { validateSubscriptionRequest } from "./validation.js";

export type ManagedSubscriptionState =
  "pending" | "activating" | "active" | "suspended" | "restoring" | "failed" | "closed";

export interface NormalizedSubscriptionRequest extends SubscriptionRequest {
  readonly addresses: readonly ReturnType<typeof normalizeAddress>[];
}

export interface SubscriptionActivationContext {
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly restoring: boolean;
}

export interface SubscriptionTransport {
  activate(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle>;
}

export interface ManagedSubscriptionHandle extends SubscriptionHandle {
  readonly state: ManagedSubscriptionState;
  readonly request: Readonly<NormalizedSubscriptionRequest>;
  unsubscribe(): Promise<void>;
}

export interface SubscriptionManagerDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly adapterId: string;
  readonly timestamp: number;
  readonly subscriptionId?: string;
}

export interface SubscriptionManagerOptions {
  readonly adapterId: string;
  readonly lifecycle: DataSourceLifecycleController;
  readonly transport: SubscriptionTransport;
  readonly deduplicate?: boolean;
  readonly now?: () => number;
  readonly onDiagnostic?: (diagnostic: Readonly<SubscriptionManagerDiagnostic>) => void;
}

export interface SubscriptionManager {
  readonly disposed: boolean;
  subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle>;
  dispose(): Promise<void>;
}

interface Consumer {
  readonly id: string;
  readonly listener: DataSourceEventListener;
  closed: boolean;
}

interface Entry {
  readonly key: string;
  readonly request: Readonly<NormalizedSubscriptionRequest>;
  readonly consumers: Map<string, Consumer>;
  state: ManagedSubscriptionState;
  generation: number;
  activation: Promise<void> | undefined;
  abort: AbortController | undefined;
  transportHandle: SubscriptionHandle | undefined;
}

export function normalizeSubscriptionRequest(
  request: Readonly<SubscriptionRequest>
): Readonly<NormalizedSubscriptionRequest> {
  validateSubscriptionRequest(request);
  const addresses = request.addresses
    .map((address) => normalizeAddress(address))
    .sort((left, right) => dataPointAddressKey(left).localeCompare(dataPointAddressKey(right)));
  const metadata = normalizeMetadata(request.metadata);
  return Object.freeze({
    ...(request.id === undefined ? {} : { id: request.id }),
    addresses: Object.freeze(addresses),
    ...(request.samplingIntervalMs === undefined
      ? {}
      : { samplingIntervalMs: request.samplingIntervalMs }),
    ...(request.publishIntervalMs === undefined
      ? {}
      : { publishIntervalMs: request.publishIntervalMs }),
    ...(request.deadband === undefined ? {} : { deadband: Object.freeze({ ...request.deadband }) }),
    ...(request.queueSize === undefined ? {} : { queueSize: request.queueSize }),
    ...(request.discardOldest === undefined ? {} : { discardOldest: request.discardOldest }),
    ...(metadata === undefined ? {} : { metadata })
  });
}

export function subscriptionRequestKey(request: Readonly<NormalizedSubscriptionRequest>): string {
  return stableStringify({
    addresses: request.addresses,
    samplingIntervalMs: request.samplingIntervalMs,
    publishIntervalMs: request.publishIntervalMs,
    deadband: request.deadband,
    queueSize: request.queueSize,
    discardOldest: request.discardOldest,
    metadata: request.metadata
  });
}

export function createSubscriptionManager(
  options: Readonly<SubscriptionManagerOptions>
): SubscriptionManager {
  return new ManagedSubscriptionManager(options);
}

class ManagedSubscriptionManager implements SubscriptionManager {
  readonly #adapterId: string;
  readonly #lifecycle: DataSourceLifecycleController;
  readonly #transport: SubscriptionTransport;
  readonly #deduplicate: boolean;
  readonly #now: () => number;
  readonly #onDiagnostic: SubscriptionManagerOptions["onDiagnostic"];
  readonly #entries = new Map<string, Entry>();
  readonly #consumerEntries = new Map<string, Entry>();
  readonly #lifecycleSubscription: StatusSubscription;
  #nextConsumerId = 1;
  #nextUniqueKey = 1;
  #disposed = false;
  #disposePromise: Promise<void> | undefined;

  public constructor(options: Readonly<SubscriptionManagerOptions>) {
    this.#adapterId = options.adapterId;
    this.#lifecycle = options.lifecycle;
    this.#transport = options.transport;
    this.#deduplicate = options.deduplicate ?? true;
    this.#now = options.now ?? Date.now;
    this.#onDiagnostic = options.onDiagnostic;
    this.#lifecycleSubscription = this.#lifecycle.subscribeStatus((status) => {
      this.#onLifecycleStatus(status);
    }, false);
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public async subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle> {
    this.#assertActive();
    const normalized = normalizeSubscriptionRequest(request);
    const descriptorKey = subscriptionRequestKey(normalized);
    const key = this.#deduplicate ? descriptorKey : `${descriptorKey}#${this.#nextUniqueKey++}`;
    let entry = this.#entries.get(key);
    if (!entry) {
      entry = {
        key,
        request: normalized,
        consumers: new Map(),
        state: "pending",
        generation: -1,
        activation: undefined,
        abort: undefined,
        transportHandle: undefined
      };
      this.#entries.set(key, entry);
    }
    const id = `${this.#adapterId}:subscription:${this.#nextConsumerId++}`;
    const consumer: Consumer = { id, listener, closed: false };
    entry.consumers.set(id, consumer);
    this.#consumerEntries.set(id, entry);
    if (this.#lifecycle.status.state === "connected") await this.#activate(entry, false);
    return this.#createHandle(entry, consumer);
  }

  public dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    this.#lifecycleSubscription.unsubscribe();
    const work = (async (): Promise<void> => {
      const entries = [...this.#entries.values()];
      for (const entry of entries) {
        for (const consumer of entry.consumers.values()) consumer.closed = true;
        entry.consumers.clear();
        await this.#closeTransport(entry);
        entry.state = "closed";
      }
      this.#entries.clear();
      this.#consumerEntries.clear();
    })();
    this.#disposePromise = work;
    return work;
  }

  #createHandle(entry: Entry, consumer: Consumer): ManagedSubscriptionHandle {
    return {
      id: consumer.id,
      get closed(): boolean {
        return consumer.closed;
      },
      get state(): ManagedSubscriptionState {
        return consumer.closed ? "closed" : entry.state;
      },
      request: entry.request,
      unsubscribe: (): Promise<void> => this.#unsubscribe(consumer.id)
    };
  }

  async #unsubscribe(id: string): Promise<void> {
    const entry = this.#consumerEntries.get(id);
    if (!entry) return;
    const consumer = entry.consumers.get(id);
    if (!consumer || consumer.closed) return;
    consumer.closed = true;
    entry.consumers.delete(id);
    this.#consumerEntries.delete(id);
    if (entry.consumers.size > 0) return;
    this.#entries.delete(entry.key);
    await this.#closeTransport(entry);
    entry.state = "closed";
  }

  #onLifecycleStatus(status: Readonly<DataSourceLifecycleStatus>): void {
    if (this.#disposed) return;
    if (status.state === "connected") {
      for (const entry of this.#entries.values()) void this.#activate(entry, entry.generation >= 0);
      return;
    }
    if (["reconnecting", "disconnecting", "disconnected", "failed"].includes(status.state)) {
      for (const entry of this.#entries.values()) {
        entry.abort?.abort();
        entry.abort = undefined;
        entry.generation = -1;
        entry.state = "suspended";
        const handle = entry.transportHandle;
        entry.transportHandle = undefined;
        if (handle) void this.#safeUnsubscribe(handle, entry);
      }
    }
    if (status.state === "disposed") void this.dispose();
  }

  async #activate(entry: Entry, restoring: boolean): Promise<void> {
    if (
      this.#disposed ||
      entry.consumers.size === 0 ||
      this.#lifecycle.status.state !== "connected"
    )
      return;
    const generation = this.#lifecycle.status.generation;
    if (entry.generation === generation && (entry.activation || entry.transportHandle)) {
      await entry.activation;
      return;
    }
    if (entry.activation) {
      await entry.activation;
      return;
    }
    const abort = new AbortController();
    entry.abort = abort;
    entry.generation = generation;
    entry.state = restoring ? "restoring" : "activating";
    const activation = this.#transport
      .activate(
        entry.request,
        (event) => {
          this.#deliver(entry, generation, event);
        },
        Object.freeze({ generation, signal: abort.signal, restoring })
      )
      .then(async (handle) => {
        if (
          this.#disposed ||
          abort.signal.aborted ||
          entry.consumers.size === 0 ||
          entry.generation !== generation ||
          this.#lifecycle.status.generation !== generation ||
          this.#lifecycle.status.state !== "connected"
        ) {
          await this.#safeUnsubscribe(handle, entry);
          return;
        }
        entry.transportHandle = handle;
        entry.state = "active";
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted || this.#disposed) return;
        entry.state = "failed";
        this.#diagnostic(
          restoring
            ? "DATASOURCE_SUBSCRIPTION_RESTORE_ERROR"
            : "DATASOURCE_SUBSCRIPTION_ACTIVATION_ERROR",
          "warning",
          restoring ? "Subscription restoration failed." : "Subscription activation failed.",
          entry
        );
        void cause;
      })
      .finally(() => {
        if (entry.activation === activation) entry.activation = undefined;
        if (entry.abort === abort) entry.abort = undefined;
      });
    entry.activation = activation;
    await activation;
  }

  #deliver(entry: Entry, generation: number, event: DataSourceEvent): void {
    if (
      this.#disposed ||
      entry.state !== "active" ||
      entry.generation !== generation ||
      this.#lifecycle.status.generation !== generation ||
      this.#lifecycle.status.state !== "connected"
    )
      return;
    for (const consumer of [...entry.consumers.values()]) {
      if (consumer.closed) continue;
      try {
        const listener: (value: DataSourceEvent) => unknown = consumer.listener;
        const result = listener(event);
        if (result instanceof Promise) {
          void result.catch(() => {
            this.#diagnostic(
              "DATASOURCE_LISTENER_ERROR",
              "warning",
              "An asynchronous subscription listener failed.",
              entry
            );
          });
        }
      } catch {
        this.#diagnostic(
          "DATASOURCE_LISTENER_ERROR",
          "warning",
          "A subscription listener failed.",
          entry
        );
      }
    }
  }

  async #closeTransport(entry: Entry): Promise<void> {
    entry.abort?.abort();
    entry.abort = undefined;
    entry.generation = -1;
    const handle = entry.transportHandle;
    entry.transportHandle = undefined;
    if (handle) await this.#safeUnsubscribe(handle, entry);
  }

  async #safeUnsubscribe(handle: SubscriptionHandle, entry: Entry): Promise<void> {
    try {
      await handle.unsubscribe();
    } catch {
      this.#diagnostic(
        "DATASOURCE_SUBSCRIPTION_CLEANUP_ERROR",
        "warning",
        "Transport subscription cleanup failed.",
        entry
      );
    }
  }

  #diagnostic(
    code: string,
    severity: SubscriptionManagerDiagnostic["severity"],
    message: string,
    entry?: Entry
  ): void {
    try {
      this.#onDiagnostic?.(
        Object.freeze({
          code,
          severity,
          message,
          adapterId: this.#adapterId,
          timestamp: this.#now(),
          ...(entry === undefined ? {} : { subscriptionId: entry.request.id ?? entry.key })
        })
      );
    } catch {
      // Diagnostics are isolated from subscription ownership.
    }
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new DataSourceError("DATASOURCE_DISPOSED", "Subscription manager is disposed.", {
        adapterId: this.#adapterId,
        operation: "subscribe",
        timestamp: this.#now()
      });
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
