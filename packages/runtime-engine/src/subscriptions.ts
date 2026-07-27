import type {
  RuntimeEngineStatus,
  RuntimeObserver,
  RuntimeObservedChangeType,
  RuntimeStatusObservation,
  RuntimeSubscriptionFilter,
  RuntimeSubscriptionManagerApi,
  RuntimeValuesObservation,
  RuntimeVisualCommitEvent,
  SubscriptionHandle
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import type { RuntimeEventBus } from "./events.js";

interface NormalizedFilter {
  readonly symbolIds?: ReadonlySet<string>;
  readonly properties?: ReadonlySet<string>;
  readonly changeTypes?: ReadonlySet<RuntimeObservedChangeType>;
  readonly signature: string;
}

interface SubscriptionRecord {
  readonly observer: RuntimeObserver;
  readonly filter: NormalizedFilter;
  readonly handle: ManagedSubscriptionHandle;
}

function normalizedValues<T extends string>(
  values: readonly T[] | undefined,
  label: string
): readonly T[] | undefined {
  if (values === undefined) return undefined;
  const normalized = [...new Set(values.map((value) => value.trim() as T))].sort();
  if (normalized.some((value) => value === ""))
    throw new RuntimeEngineError(
      "RUNTIME_SUBSCRIPTION_INVALID",
      `${label} cannot contain empty values.`
    );
  return Object.freeze(normalized);
}

function normalizeFilter(filter: RuntimeSubscriptionFilter = {}): NormalizedFilter {
  const symbolIds = normalizedValues(filter.symbolIds, "Subscription symbol IDs");
  const properties = normalizedValues(filter.properties, "Subscription properties");
  const changeTypes = normalizedValues(filter.changeTypes, "Subscription change types");
  const signature = JSON.stringify([symbolIds ?? null, properties ?? null, changeTypes ?? null]);
  return Object.freeze({
    ...(symbolIds === undefined ? {} : { symbolIds: new Set(symbolIds) }),
    ...(properties === undefined ? {} : { properties: new Set(properties) }),
    ...(changeTypes === undefined ? {} : { changeTypes: new Set(changeTypes) }),
    signature
  });
}

class ManagedSubscriptionHandle implements SubscriptionHandle {
  #disposeCallback: (() => void) | undefined;

  public constructor(
    public readonly id: string,
    disposeCallback: () => void
  ) {
    this.#disposeCallback = disposeCallback;
  }

  public get active(): boolean {
    return this.#disposeCallback !== undefined;
  }

  public get disposed(): boolean {
    return !this.active;
  }

  public dispose(): void {
    const callback = this.#disposeCallback;
    if (callback === undefined) return;
    this.#disposeCallback = undefined;
    callback();
  }
}

function changedEntries(commit: RuntimeVisualCommitEvent): readonly {
  readonly id: string;
  readonly type: RuntimeObservedChangeType;
  readonly properties?: readonly string[];
}[] {
  const { diff } = commit;
  const updated = (
    id: string,
    properties: readonly string[] | undefined
  ): {
    readonly id: string;
    readonly type: "updated";
    readonly properties?: readonly string[];
  } => ({
    id,
    type: "updated",
    ...(properties === undefined ? {} : { properties })
  });
  return [
    ...diff.addedNodeIds.map((id) => ({ id, type: "added" as const })),
    ...diff.updatedNodeIds.map((id) => updated(id, diff.changedNodeProperties?.[id])),
    ...diff.removedNodeIds.map((id) => ({ id, type: "removed" as const })),
    ...diff.addedConnectionIds.map((id) => ({ id, type: "added" as const })),
    ...diff.updatedConnectionIds.map((id) => updated(id, diff.changedConnectionProperties?.[id])),
    ...diff.removedConnectionIds.map((id) => ({ id, type: "removed" as const }))
  ];
}

function entryMatches(
  entry: ReturnType<typeof changedEntries>[number],
  filter: NormalizedFilter
): boolean {
  if (filter.symbolIds !== undefined && !filter.symbolIds.has(entry.id)) return false;
  if (filter.changeTypes !== undefined && !filter.changeTypes.has(entry.type)) return false;
  if (filter.properties === undefined || entry.type !== "updated") return true;
  return entry.properties?.some((property) => filter.properties?.has(property)) ?? false;
}

/**
 * Runtime-owned observer registry. Dispatch order is registration order and a stable copy makes
 * subscription changes during dispatch take effect on the next notification.
 */
export class RuntimeSubscriptionManager implements RuntimeSubscriptionManagerApi {
  readonly #records = new Map<string, SubscriptionRecord>();
  readonly #duplicates = new WeakMap<RuntimeObserver, Map<string, ManagedSubscriptionHandle>>();
  readonly #events: RuntimeEventBus | undefined;
  readonly #now: () => number;
  #nextId = 1;
  #disposed = false;

  public constructor(
    options: { readonly events?: RuntimeEventBus; readonly now?: () => number } = {}
  ) {
    this.#events = options.events;
    this.#now = options.now ?? (() => Date.now());
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get size(): number {
    return this.#records.size;
  }

  public subscribe(
    observer: RuntimeObserver,
    filter: RuntimeSubscriptionFilter = {}
  ): SubscriptionHandle {
    this.#assertUsable();
    const normalized = normalizeFilter(filter);
    const observerSubscriptions =
      this.#duplicates.get(observer) ?? new Map<string, ManagedSubscriptionHandle>();
    const duplicate = observerSubscriptions.get(normalized.signature);
    if (duplicate?.active === true) return duplicate;
    const id = `runtime-subscription-${String(this.#nextId)}`;
    this.#nextId += 1;
    const handle = new ManagedSubscriptionHandle(id, () => {
      this.#records.delete(id);
      observerSubscriptions.delete(normalized.signature);
      this.#events?.emit("SubscriptionDisposed", { id, timestamp: this.#now() });
    });
    this.#records.set(id, { observer, filter: normalized, handle });
    observerSubscriptions.set(normalized.signature, handle);
    this.#duplicates.set(observer, observerSubscriptions);
    this.#events?.emit("SubscriptionCreated", { id, timestamp: this.#now() });
    return handle;
  }

  public subscribeSymbol(symbolId: string, observer: RuntimeObserver): SubscriptionHandle {
    return this.subscribe(observer, { symbolIds: [symbolId] });
  }

  public subscribeSymbols(
    symbolIds: readonly string[],
    observer: RuntimeObserver
  ): SubscriptionHandle {
    return this.subscribe(observer, { symbolIds });
  }

  public subscribeSnapshot(observer: RuntimeObserver): SubscriptionHandle {
    return this.subscribe(observer);
  }

  public publishValues(observation: RuntimeValuesObservation): void {
    if (this.#disposed) return;
    for (const { observer, filter } of [...this.#records.values()]) {
      if (filter.symbolIds !== undefined || observer.onRuntimeValues === undefined) continue;
      if (
        filter.properties !== undefined &&
        !observation.changedKeys.some((key) => filter.properties?.has(key))
      )
        continue;
      this.#isolate(() => {
        observer.onRuntimeValues?.(observation);
      });
    }
  }

  public publishSnapshot(commit: RuntimeVisualCommitEvent): void {
    if (this.#disposed) return;
    const entries = changedEntries(commit);
    for (const { observer, filter } of [...this.#records.values()]) {
      const matches = entries.filter((entry) => entryMatches(entry, filter));
      if (matches.length === 0) continue;
      if (observer.onSnapshot !== undefined) {
        const symbolIds = Object.freeze([...new Set(matches.map(({ id }) => id))]);
        const changeTypes = Object.freeze([...new Set(matches.map(({ type }) => type))]);
        this.#isolate(() => {
          observer.onSnapshot?.(
            Object.freeze({
              previousSnapshot: commit.previousSnapshot,
              currentSnapshot: commit.snapshot,
              revision: commit.snapshot.revision,
              timestamp: commit.snapshot.timestamp,
              symbolIds,
              changeTypes
            })
          );
        });
      }
      if (observer.onRevision !== undefined)
        this.#isolate(() => {
          observer.onRevision?.(
            Object.freeze({
              previousRevision: commit.previousSnapshot.revision,
              revision: commit.snapshot.revision,
              timestamp: commit.snapshot.timestamp
            })
          );
        });
    }
  }

  public publishStatus(observation: RuntimeStatusObservation): void {
    if (this.#disposed) return;
    for (const { observer } of [...this.#records.values()])
      if (observer.onStatus !== undefined)
        this.#isolate(() => {
          observer.onStatus?.(observation);
        });
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const { handle } of [...this.#records.values()]) handle.dispose();
    this.#records.clear();
    this.#disposed = true;
  }

  #isolate(notify: () => void): void {
    try {
      notify();
    } catch {
      // Observers cannot interrupt delivery to later subscriptions.
    }
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime subscription manager is disposed.");
  }
}

export function statusObservation(
  previousStatus: RuntimeEngineStatus,
  status: RuntimeEngineStatus,
  timestamp: number
): RuntimeStatusObservation {
  return Object.freeze({ previousStatus, status, timestamp });
}
