import { ImmediateRuntimeScheduler } from "../scheduler.js";
import { createAlarmAggregate } from "./aggregation.js";
import { clearAlarm, resolveAcknowledgement, resolveAlarmLifecycle } from "./alarm-state.js";
import { AlarmSeverityRegistry } from "./severity-resolver.js";
import type {
  AlarmAggregate,
  AlarmChange,
  AlarmChangeKind,
  AlarmEngineOptions,
  AlarmEvaluationResult,
  AlarmEvent,
  AlarmInput,
  AlarmSnapshot,
  AlarmSnapshotDiff,
  RuntimeAlarm
} from "./types.js";

class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: ReadonlyMap<K, V>;
  public constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }
  public get size(): number {
    return this.#map.size;
  }
  public get(key: K): V | undefined {
    return this.#map.get(key);
  }
  public has(key: K): boolean {
    return this.#map.has(key);
  }
  public entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }
  public keys(): MapIterator<K> {
    return this.#map.keys();
  }
  public values(): MapIterator<V> {
    return this.#map.values();
  }
  public forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void): void {
    this.#map.forEach((value, key) => {
      callback(value, key, this);
    });
  }
  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }
  public readonly [Symbol.toStringTag] = "ImmutableAlarmMap";
}

function emptyAggregate(): AlarmAggregate {
  return createAlarmAggregate("document", "document", []);
}
function emptySnapshot(timestamp: number): AlarmSnapshot {
  return Object.freeze({
    revision: 0,
    timestamp,
    alarms: new ImmutableMap<string, RuntimeAlarm>([]),
    symbols: new ImmutableMap<string, AlarmAggregate>([]),
    connections: new ImmutableMap<string, AlarmAggregate>([]),
    groups: new ImmutableMap<string, AlarmAggregate>([]),
    layers: new ImmutableMap<string, AlarmAggregate>([]),
    document: emptyAggregate()
  });
}
function ids(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}
function classify(previous: RuntimeAlarm | undefined, current: RuntimeAlarm): AlarmChangeKind {
  if (previous === undefined) return "activated";
  if (current.lifecycle === "NORMAL" || current.lifecycle === "RETURNED_UNACK") return "cleared";
  if (previous.severity !== current.severity) return "severity-changed";
  if (!previous.acknowledged && current.acknowledged) return "acknowledged";
  if (previous.timestamp !== current.timestamp) return "timestamp-changed";
  return "updated";
}

/** Runtime-only alarm owner. Mutations are coalesced through one injected runtime scheduler. */
export class RuntimeAlarmEngine {
  readonly #registry: AlarmSeverityRegistry;
  readonly #scheduler;
  readonly #ownsScheduler: boolean;
  readonly #now: () => number;
  readonly #onEvent: ((event: AlarmEvent) => void) | undefined;
  readonly #pending = new Map<string, RuntimeAlarm>();
  readonly #listeners = new Set<(snapshot: AlarmSnapshot, diff: AlarmSnapshotDiff) => void>();
  readonly #symbolIndex = new Map<string, Set<string>>();
  readonly #connectionIndex = new Map<string, Set<string>>();
  readonly #groupIndex = new Map<string, Set<string>>();
  readonly #layerIndex = new Map<string, Set<string>>();
  #scheduled = false;
  #disposed = false;
  #snapshot: AlarmSnapshot;
  #latestDiff: AlarmSnapshotDiff | undefined;

  public constructor(options: AlarmEngineOptions = {}) {
    this.#registry = new AlarmSeverityRegistry(options.severities);
    this.#scheduler = options.scheduler ?? new ImmediateRuntimeScheduler();
    this.#ownsScheduler = options.scheduler === undefined;
    this.#now = options.now ?? (() => Date.now());
    this.#onEvent = options.onEvent;
    this.#snapshot = emptySnapshot(this.#validNow());
  }
  public get snapshot(): AlarmSnapshot {
    return this.#snapshot;
  }
  public get severities(): AlarmSeverityRegistry {
    return this.#registry;
  }

  public evaluate(input: AlarmInput): AlarmEvaluationResult {
    this.#assertUsable();
    this.#validate(input);
    const previous = this.#pending.get(input.alarmId) ?? this.#snapshot.alarms.get(input.alarmId);
    const alarm = resolveAlarmLifecycle(previous, input);
    if (alarm === previous) return { changed: false, snapshot: this.#snapshot };
    this.#pending.set(alarm.alarmId, alarm);
    const before = this.#snapshot;
    this.#schedule();
    return this.#resultAfterSchedule(before);
  }

  public evaluateMany(inputs: readonly AlarmInput[]): AlarmEvaluationResult {
    this.#assertUsable();
    const before = this.#snapshot;
    for (const input of inputs) {
      this.#validate(input);
      const previous = this.#pending.get(input.alarmId) ?? this.#snapshot.alarms.get(input.alarmId);
      const alarm = resolveAlarmLifecycle(previous, input);
      if (alarm !== previous) this.#pending.set(alarm.alarmId, alarm);
    }
    if (this.#pending.size === 0) return { changed: false, snapshot: this.#snapshot };
    this.#schedule();
    return this.#resultAfterSchedule(before);
  }

  public acknowledge(alarmId: string, timestamp = this.#validNow()): AlarmEvaluationResult {
    this.#assertUsable();
    const previous = this.#pending.get(alarmId) ?? this.#snapshot.alarms.get(alarmId);
    if (previous === undefined) return { changed: false, snapshot: this.#snapshot };
    const alarm = resolveAcknowledgement(previous, timestamp);
    if (alarm === previous) return { changed: false, snapshot: this.#snapshot };
    this.#pending.set(alarmId, alarm);
    const before = this.#snapshot;
    this.#schedule();
    return this.#resultAfterSchedule(before);
  }

  public clear(alarmId: string, timestamp = this.#validNow()): AlarmEvaluationResult {
    this.#assertUsable();
    const previous = this.#pending.get(alarmId) ?? this.#snapshot.alarms.get(alarmId);
    if (previous === undefined) return { changed: false, snapshot: this.#snapshot };
    const alarm = clearAlarm(previous, timestamp);
    if (alarm === previous) return { changed: false, snapshot: this.#snapshot };
    this.#pending.set(alarmId, alarm);
    const before = this.#snapshot;
    this.#schedule();
    return this.#resultAfterSchedule(before);
  }

  public flush(): AlarmEvaluationResult {
    this.#assertUsable();
    this.#scheduled = false;
    if (this.#pending.size === 0) return { changed: false, snapshot: this.#snapshot };
    const previousSnapshot = this.#snapshot;
    const alarms = new Map(previousSnapshot.alarms);
    const changes: AlarmChange[] = [];
    for (const [alarmId, current] of [...this.#pending].sort(([a], [b]) => a.localeCompare(b))) {
      const previous = alarms.get(alarmId);
      if (previous !== undefined && equivalent(previous, current)) continue;
      alarms.set(alarmId, current);
      changes.push(
        Object.freeze({
          alarmId,
          kind: classify(previous, current),
          ...(previous === undefined ? {} : { previous }),
          current
        })
      );
    }
    this.#pending.clear();
    if (changes.length === 0) return { changed: false, snapshot: this.#snapshot };
    const changedAlarms = changes
      .flatMap(({ previous, current }) => [previous, current])
      .filter((alarm): alarm is RuntimeAlarm => alarm !== undefined);
    const symbolIds = ids(changedAlarms.map(({ symbolId }) => symbolId));
    const connectionIds = ids(
      changedAlarms.flatMap(({ connectionId }) =>
        connectionId === undefined ? [] : [connectionId]
      )
    );
    const groupIds = ids(
      changedAlarms.flatMap(({ groupId }) => (groupId === undefined ? [] : [groupId]))
    );
    const layerIds = ids(
      changedAlarms.flatMap(({ layerId }) => (layerId === undefined ? [] : [layerId]))
    );
    for (const change of changes) this.#updateIndexes(change);
    const symbols = this.#reaggregate(
      previousSnapshot.symbols,
      "symbol",
      symbolIds,
      alarms,
      this.#symbolIndex
    );
    const connections = this.#reaggregate(
      previousSnapshot.connections,
      "connection",
      connectionIds,
      alarms,
      this.#connectionIndex
    );
    const groups = this.#reaggregate(
      previousSnapshot.groups,
      "group",
      groupIds,
      alarms,
      this.#groupIndex
    );
    const layers = this.#reaggregate(
      previousSnapshot.layers,
      "layer",
      layerIds,
      alarms,
      this.#layerIndex
    );
    const revision = previousSnapshot.revision + 1;
    const snapshot: AlarmSnapshot = Object.freeze({
      revision,
      timestamp: this.#validNow(),
      alarms: new ImmutableMap(alarms),
      symbols,
      connections,
      groups,
      layers,
      document: createAlarmAggregate("document", "document", [...alarms.values()], this.#registry)
    });
    const diff: AlarmSnapshotDiff = Object.freeze({
      fromRevision: previousSnapshot.revision,
      toRevision: revision,
      changes: Object.freeze(changes),
      changedSymbolIds: symbolIds,
      changedConnectionIds: connectionIds,
      changedGroupIds: groupIds,
      changedLayerIds: layerIds,
      documentChanged: true
    });
    this.#snapshot = snapshot;
    this.#latestDiff = diff;
    for (const change of changes) this.#emit(change);
    for (const listener of [...this.#listeners]) listener(snapshot, diff);
    return { changed: true, snapshot, diff };
  }

  public subscribe(
    listener: (snapshot: AlarmSnapshot, diff: AlarmSnapshotDiff) => void
  ): () => void {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#pending.clear();
    this.#listeners.clear();
    this.#symbolIndex.clear();
    this.#connectionIndex.clear();
    this.#groupIndex.clear();
    this.#layerIndex.clear();
    if (this.#ownsScheduler) this.#scheduler.dispose();
    this.#disposed = true;
  }

  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#scheduler.schedule(() => {
      if (!this.#disposed) this.flush();
    });
  }
  #reaggregate(
    previous: ReadonlyMap<string, AlarmAggregate>,
    scope: "symbol" | "connection" | "group" | "layer",
    changedIds: readonly string[],
    alarms: ReadonlyMap<string, RuntimeAlarm>,
    index: ReadonlyMap<string, ReadonlySet<string>>
  ): ReadonlyMap<string, AlarmAggregate> {
    const result = new Map(previous);
    for (const id of changedIds) {
      const scoped = [...(index.get(id) ?? [])].flatMap((alarmId) => {
        const alarm = alarms.get(alarmId);
        return alarm === undefined ? [] : [alarm];
      });
      result.set(id, createAlarmAggregate(scope, id, scoped, this.#registry));
    }
    return new ImmutableMap(result);
  }
  #updateIndexes(change: AlarmChange): void {
    const remove = (index: Map<string, Set<string>>, scopeId: string | undefined): void => {
      if (scopeId === undefined) return;
      const alarmIds = index.get(scopeId);
      alarmIds?.delete(change.alarmId);
      if (alarmIds?.size === 0) index.delete(scopeId);
    };
    const add = (index: Map<string, Set<string>>, scopeId: string | undefined): void => {
      if (scopeId === undefined) return;
      const alarmIds = index.get(scopeId) ?? new Set<string>();
      alarmIds.add(change.alarmId);
      index.set(scopeId, alarmIds);
    };
    if (change.previous !== undefined) {
      remove(this.#symbolIndex, change.previous.symbolId);
      remove(this.#connectionIndex, change.previous.connectionId);
      remove(this.#groupIndex, change.previous.groupId);
      remove(this.#layerIndex, change.previous.layerId);
    }
    if (change.current !== undefined) {
      add(this.#symbolIndex, change.current.symbolId);
      add(this.#connectionIndex, change.current.connectionId);
      add(this.#groupIndex, change.current.groupId);
      add(this.#layerIndex, change.current.layerId);
    }
  }
  #emit(change: AlarmChange): void {
    const alarm = change.current;
    if (alarm === undefined || this.#onEvent === undefined) return;
    if (change.kind === "activated") this.#onEvent({ type: "AlarmActivated", alarm });
    else if (change.kind === "cleared")
      this.#onEvent({
        type: alarm.lifecycle === "RETURNED_UNACK" ? "AlarmReturned" : "AlarmCleared",
        alarm
      });
    else if (change.kind === "severity-changed" && change.previous !== undefined)
      this.#onEvent({ type: "SeverityChanged", alarm, previousSeverity: change.previous.severity });
    else if (change.kind === "acknowledged") this.#onEvent({ type: "Acknowledged", alarm });
    if (alarm.status === "Shelved") this.#onEvent({ type: "Shelved", alarm });
    if (alarm.status === "Suppressed") this.#onEvent({ type: "Suppressed", alarm });
  }
  #validate(input: AlarmInput): void {
    if (
      !input.alarmId.trim() ||
      !input.symbolId.trim() ||
      !input.sourceId.trim() ||
      !input.code.trim() ||
      !input.origin.trim()
    )
      throw new TypeError("Alarm identity fields must not be empty.");
    if (
      !Number.isFinite(input.timestamp) ||
      !Number.isFinite(input.priority ?? 0) ||
      !Number.isFinite(input.sourcePriority ?? 0)
    )
      throw new TypeError("Alarm timestamps and priorities must be finite.");
    if (this.#registry.get(input.severity) === undefined)
      throw new TypeError(`Unknown alarm severity: ${input.severity}`);
  }
  #validNow(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) throw new TypeError("Alarm clock must return a finite timestamp.");
    return value;
  }
  #resultAfterSchedule(before: AlarmSnapshot): AlarmEvaluationResult {
    if (this.#snapshot === before) return { changed: true, snapshot: this.#snapshot };
    const diff = this.#latestDiff;
    return diff === undefined
      ? { changed: true, snapshot: this.#snapshot }
      : { changed: true, snapshot: this.#snapshot, diff };
  }
  #assertUsable(): void {
    if (this.#disposed) throw new Error("Runtime alarm engine is disposed.");
  }
}

function equivalent(left: RuntimeAlarm, right: RuntimeAlarm): boolean {
  return (
    left.alarmId === right.alarmId &&
    left.revision === right.revision &&
    left.timestamp === right.timestamp &&
    left.severity === right.severity &&
    left.status === right.status &&
    left.lifecycle === right.lifecycle &&
    left.acknowledged === right.acknowledged
  );
}
