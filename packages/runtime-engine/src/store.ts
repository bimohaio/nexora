import type { JsonValue } from "@web-scada/core";
import {
  type DataQuality,
  type MutableTagStore,
  type RuntimeBatchResult,
  type RuntimeChange,
  type RuntimeChangeSet,
  type RuntimeDataPoint,
  type RuntimeDataPointInput,
  type RuntimeDiagnostic,
  type RuntimeDiagnosticCode,
  type RuntimeSnapshot,
  type RuntimeStoreListener,
  type RuntimeSubscription,
  type RuntimeUpdateResult,
  type RuntimeValue,
  type TagStoreListener
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";

const DATA_TYPES: readonly RuntimeValue["dataType"][] = ["boolean", "number", "string", "json"];
const QUALITIES: readonly DataQuality[] = ["good", "uncertain", "bad", "offline", "unknown"];
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export interface InMemoryTagStoreOptions {
  readonly now?: () => number;
  readonly defaultQuality?: DataQuality;
  readonly onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
}

function diagnostic(
  code: RuntimeDiagnosticCode,
  message: string,
  now: number,
  context: Readonly<Record<string, JsonValue>> = {}
): RuntimeDiagnostic {
  return Object.freeze({
    code,
    severity: "warning" as const,
    message,
    recoverable: true,
    timestamp: new Date(now).toISOString(),
    context: Object.freeze({ ...context })
  });
}

function cloneJsonValue(value: unknown, ancestors = new WeakSet()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Runtime numbers must be finite.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object")
    throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Runtime values must be JSON-safe.");
  if (ancestors.has(value))
    throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Cyclic runtime values are not allowed.");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new RuntimeEngineError(
      "RUNTIME_VALUE_INVALID",
      "Runtime objects must be plain JSON objects."
    );
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = Object.freeze(value.map((entry) => cloneJsonValue(entry, ancestors)));
    ancestors.delete(value);
    return result;
  }
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_KEYS.has(key))
      throw new RuntimeEngineError(
        "RUNTIME_VALUE_INVALID",
        "Unsafe runtime object keys are not allowed."
      );
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined)
      throw new RuntimeEngineError(
        "RUNTIME_VALUE_INVALID",
        "Undefined runtime object fields are not allowed."
      );
    result[key] = cloneJsonValue(entry, ancestors);
  }
  ancestors.delete(value);
  return Object.freeze(result);
}

function cloneMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, JsonValue>> | undefined {
  if (metadata === undefined) return undefined;
  const cloned = cloneJsonValue(metadata);
  if (cloned === null || Array.isArray(cloned) || typeof cloned !== "object")
    throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Runtime metadata must be an object.");
  return cloned as Readonly<Record<string, JsonValue>>;
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftArray = left as readonly JsonValue[];
    const rightArray = right as readonly JsonValue[];
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      leftArray.length === rightArray.length &&
      leftArray.every((entry, index) => {
        const other = rightArray[index];
        return other !== undefined && jsonEqual(entry, other);
      })
    );
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  const leftRecord = left as Readonly<Record<string, JsonValue>>;
  const rightRecord = right as Readonly<Record<string, JsonValue>>;
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return (
        rightKey === key && jsonEqual(leftRecord[key] as JsonValue, rightRecord[key] as JsonValue)
      );
    })
  );
}

function dataPointsEqual(left: RuntimeDataPoint, right: RuntimeDataPoint): boolean {
  return (
    left.key === right.key &&
    jsonEqual(left.value, right.value) &&
    left.quality === right.quality &&
    left.qualityDetail === right.qualityDetail &&
    left.timestamp === right.timestamp &&
    left.source === right.source &&
    left.sequence === right.sequence &&
    jsonEqual(left.metadata ?? null, right.metadata ?? null)
  );
}

function cloneDataPoint(point: RuntimeDataPoint): RuntimeDataPoint {
  const metadata = point.metadata === undefined ? undefined : cloneMetadata(point.metadata);
  if (point.metadata !== undefined && metadata === undefined)
    throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Runtime metadata cloning failed.");
  return Object.freeze({
    key: point.key,
    value: cloneJsonValue(point.value),
    quality: point.quality,
    timestamp: point.timestamp,
    ingestionTimestamp: point.ingestionTimestamp,
    ...(point.qualityDetail === undefined ? {} : { qualityDetail: point.qualityDetail }),
    ...(point.source === undefined ? {} : { source: point.source }),
    ...(point.sequence === undefined ? {} : { sequence: point.sequence }),
    ...(metadata === undefined ? {} : { metadata })
  });
}

function toRuntimeValue(point: RuntimeDataPoint): RuntimeValue {
  const value = point.value;
  return Object.freeze({
    tagId: point.key,
    value,
    dataType:
      typeof value === "boolean"
        ? "boolean"
        : typeof value === "number"
          ? "number"
          : typeof value === "string"
            ? "string"
            : "json",
    quality: point.quality,
    timestamp: new Date(point.timestamp).toISOString(),
    ...(point.source === undefined ? {} : { source: point.source }),
    ...(point.sequence === undefined ? {} : { sequence: point.sequence }),
    ...(point.metadata === undefined ? {} : { metadata: point.metadata })
  });
}

class ImmutableRuntimeSnapshot implements RuntimeSnapshot {
  readonly #values: ReadonlyMap<string, RuntimeDataPoint>;
  public readonly size: number;

  public constructor(
    public readonly revision: number,
    public readonly timestamp: number,
    values: ReadonlyMap<string, RuntimeDataPoint>
  ) {
    this.#values = new Map(
      [...values.entries()].map(([key, point]) => [key, cloneDataPoint(point)] as const)
    );
    this.size = this.#values.size;
    Object.freeze(this);
  }

  public has(key: string): boolean {
    return this.#values.has(key);
  }

  public get(key: string): RuntimeDataPoint | undefined {
    return this.#values.get(key);
  }

  public getAll(): readonly RuntimeDataPoint[] {
    return Object.freeze(
      [...this.#values.values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(cloneDataPoint)
    );
  }
}

class StoreSubscription implements RuntimeSubscription {
  #closed = false;

  public constructor(private readonly close: () => void) {}

  public get closed(): boolean {
    return this.#closed;
  }

  public unsubscribe(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.close();
  }
}

export function isRuntimeValue(value: RuntimeValue): boolean {
  try {
    cloneJsonValue(value.value);
  } catch {
    return false;
  }
  return (
    value.tagId.trim() !== "" &&
    DATA_TYPES.includes(value.dataType) &&
    QUALITIES.includes(value.quality) &&
    Number.isFinite(Date.parse(value.timestamp)) &&
    (value.sequence === undefined || (Number.isSafeInteger(value.sequence) && value.sequence >= 0))
  );
}

export class InMemoryTagStore implements MutableTagStore {
  readonly #values = new Map<string, RuntimeDataPoint>();
  readonly #legacyListeners = new Set<TagStoreListener>();
  readonly #changeListeners = new Map<number, RuntimeStoreListener>();
  readonly #now: () => number;
  readonly #defaultQuality: DataQuality;
  readonly #onDiagnostic: InMemoryTagStoreOptions["onDiagnostic"];
  #nextListenerId = 0;
  #revision = 0;
  #disposed = false;
  #dispatching = false;
  #snapshot: RuntimeSnapshot | undefined;

  public constructor(options: InMemoryTagStoreOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#defaultQuality = options.defaultQuality ?? "unknown";
    this.#onDiagnostic = options.onDiagnostic;
  }

  public get revision(): number {
    return this.#revision;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get(tagId: string): RuntimeValue | undefined {
    const point = this.#values.get(tagId);
    return point === undefined ? undefined : toRuntimeValue(point);
  }

  public getAll(): readonly RuntimeValue[] {
    return Object.freeze(this.snapshot().getAll().map(toRuntimeValue));
  }

  public has(key: string): boolean {
    return this.#values.has(key);
  }

  public getDataPoint(key: string): RuntimeDataPoint | undefined {
    const point = this.#values.get(key);
    return point === undefined ? undefined : cloneDataPoint(point);
  }

  public subscribe(listener: TagStoreListener): () => void {
    this.#assertUsable();
    this.#legacyListeners.add(listener);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.#legacyListeners.delete(listener);
    };
  }

  public subscribeChanges(listener: RuntimeStoreListener): RuntimeSubscription {
    this.#assertUsable();
    const id = this.#nextListenerId;
    this.#nextListenerId += 1;
    this.#changeListeners.set(id, listener);
    return new StoreSubscription(() => {
      this.#changeListeners.delete(id);
    });
  }

  public set(value: RuntimeValue): boolean {
    const result = this.update({
      key: value.tagId,
      value: value.value,
      quality: value.quality,
      timestamp: Date.parse(value.timestamp),
      ...(value.source === undefined ? {} : { source: value.source }),
      ...(value.sequence === undefined ? {} : { sequence: value.sequence }),
      ...(value.metadata === undefined ? {} : { metadata: value.metadata })
    });
    return result.changed;
  }

  public setMany(values: readonly RuntimeValue[]): readonly RuntimeValue[] {
    const keys = [...new Set(values.map(({ tagId }) => tagId))];
    const result = this.updateMany(
      values.map((value) => ({
        key: value.tagId,
        value: value.value,
        quality: value.quality,
        timestamp: Date.parse(value.timestamp),
        ...(value.source === undefined ? {} : { source: value.source }),
        ...(value.sequence === undefined ? {} : { sequence: value.sequence }),
        ...(value.metadata === undefined ? {} : { metadata: value.metadata })
      }))
    );
    if (!result.changed) return [];
    const changedKeys = new Set(result.changeSet?.changes.map(({ key }) => key));
    return Object.freeze(
      keys
        .filter((key) => changedKeys.has(key))
        .map((key) => this.get(key))
        .filter((entry): entry is RuntimeValue => entry !== undefined)
    );
  }

  public update(input: Readonly<RuntimeDataPointInput>): RuntimeUpdateResult {
    const result = this.updateMany([input]);
    return {
      changed: result.changed,
      revision: result.revision,
      diagnostics: result.diagnostics,
      ...(result.changeSet === undefined ? {} : { changeSet: result.changeSet })
    };
  }

  public updateMany(inputs: readonly Readonly<RuntimeDataPointInput>[]): RuntimeBatchResult {
    this.#assertWritable();
    const now = this.#now();
    if (!Number.isFinite(now))
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Runtime store clock must return finite epoch milliseconds."
      );
    const diagnostics: RuntimeDiagnostic[] = [];
    const normalized: RuntimeDataPoint[] = [];
    const keys = new Set<string>();
    for (const input of inputs) {
      if (keys.has(input.key)) {
        diagnostics.push(
          diagnostic("RUNTIME_DUPLICATE_KEY", "A runtime batch contains a duplicate key.", now, {
            key: input.key
          })
        );
        continue;
      }
      keys.add(input.key);
      const result = this.#normalize(input, now);
      if (result.diagnostic !== undefined) diagnostics.push(result.diagnostic);
      else if (result.point !== undefined) normalized.push(result.point);
    }
    if (diagnostics.length > 0) {
      for (const entry of diagnostics) this.#onDiagnostic?.(entry);
      return Object.freeze({
        changed: false,
        revision: this.#revision,
        accepted: 0,
        rejected: inputs.length,
        diagnostics: Object.freeze(diagnostics)
      });
    }
    const changes: RuntimeChange[] = [];
    for (const point of normalized) {
      const previous = this.#values.get(point.key);
      if (
        previous !== undefined &&
        ((point.sequence !== undefined &&
          previous.sequence !== undefined &&
          point.sequence < previous.sequence) ||
          (point.sequence === undefined && point.timestamp < previous.timestamp))
      ) {
        const entry = diagnostic(
          "RUNTIME_VALUE_OUT_OF_ORDER",
          "Out-of-order runtime value was ignored.",
          now,
          { key: point.key }
        );
        diagnostics.push(entry);
        this.#onDiagnostic?.(entry);
        continue;
      }
      if (previous !== undefined && dataPointsEqual(previous, point)) continue;
      changes.push(
        Object.freeze({
          key: point.key,
          kind: previous === undefined ? ("added" as const) : ("updated" as const),
          ...(previous === undefined ? {} : { previous: cloneDataPoint(previous) }),
          current: cloneDataPoint(point)
        })
      );
    }
    return this.#commit(changes, now, normalized.length, 0, diagnostics);
  }

  public delete(tagId: string): boolean {
    return this.remove(tagId).changed;
  }

  public remove(key: string): RuntimeUpdateResult {
    this.#assertWritable();
    const previous = this.#values.get(key);
    if (previous === undefined)
      return Object.freeze({
        changed: false,
        revision: this.#revision,
        diagnostics: Object.freeze([])
      });
    const result = this.#commit(
      [Object.freeze({ key, kind: "removed" as const, previous: cloneDataPoint(previous) })],
      this.#now(),
      1,
      0,
      []
    );
    return {
      changed: result.changed,
      revision: result.revision,
      diagnostics: result.diagnostics,
      ...(result.changeSet === undefined ? {} : { changeSet: result.changeSet })
    };
  }

  public clear(): RuntimeBatchResult {
    this.#assertWritable();
    const changes = [...this.#values.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((previous) =>
        Object.freeze({
          key: previous.key,
          kind: "removed" as const,
          previous: cloneDataPoint(previous)
        })
      );
    return this.#commit(changes, this.#now(), changes.length, 0, []);
  }

  public markQuality(tagIds: readonly string[], quality: DataQuality): readonly RuntimeValue[] {
    if (!QUALITIES.includes(quality))
      throw new RuntimeEngineError("RUNTIME_VALUE_INVALID", "Runtime quality is invalid.");
    const inputs = [...new Set(tagIds)]
      .sort()
      .map((key) => this.#values.get(key))
      .filter(
        (point): point is RuntimeDataPoint => point !== undefined && point.quality !== quality
      )
      .map((point) => ({
        key: point.key,
        value: point.value,
        quality,
        timestamp: point.timestamp,
        ...(point.qualityDetail === undefined ? {} : { qualityDetail: point.qualityDetail }),
        ...(point.source === undefined ? {} : { source: point.source }),
        ...(point.sequence === undefined ? {} : { sequence: point.sequence }),
        ...(point.metadata === undefined ? {} : { metadata: point.metadata })
      }));
    const result = this.updateMany(inputs);
    if (!result.changed) return [];
    return Object.freeze(
      inputs
        .map(({ key }) => this.get(key))
        .filter((value): value is RuntimeValue => value !== undefined)
    );
  }

  public snapshot(): RuntimeSnapshot {
    if (this.#snapshot?.revision === this.#revision) return this.#snapshot;
    const now = this.#now();
    if (!Number.isFinite(now))
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Runtime store clock must return finite epoch milliseconds."
      );
    this.#snapshot = new ImmutableRuntimeSnapshot(this.#revision, now, this.#values);
    return this.#snapshot;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#legacyListeners.clear();
    this.#changeListeners.clear();
  }

  #normalize(
    input: Readonly<RuntimeDataPointInput>,
    ingestionTimestamp: number
  ): { readonly point?: RuntimeDataPoint; readonly diagnostic?: RuntimeDiagnostic } {
    if (typeof input.key !== "string" || input.key.trim() === "")
      return {
        diagnostic: diagnostic(
          "RUNTIME_INVALID_KEY",
          "Runtime keys must be non-empty strings.",
          ingestionTimestamp
        )
      };
    const quality = input.quality ?? this.#defaultQuality;
    if (!QUALITIES.includes(quality))
      return {
        diagnostic: diagnostic(
          "RUNTIME_INVALID_QUALITY",
          "Runtime quality is invalid.",
          ingestionTimestamp,
          { key: input.key }
        )
      };
    const timestamp = input.timestamp ?? ingestionTimestamp;
    if (!Number.isFinite(timestamp))
      return {
        diagnostic: diagnostic(
          "RUNTIME_INVALID_TIMESTAMP",
          "Runtime timestamps must be finite epoch milliseconds.",
          ingestionTimestamp,
          { key: input.key }
        )
      };
    if (
      input.sequence !== undefined &&
      (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
    )
      return {
        diagnostic: diagnostic(
          "RUNTIME_INVALID_SEQUENCE",
          "Runtime sequence must be a non-negative safe integer.",
          ingestionTimestamp,
          { key: input.key }
        )
      };
    if (input.source?.trim() === "")
      return {
        diagnostic: diagnostic(
          "RUNTIME_INVALID_SOURCE",
          "Runtime source identity cannot be empty.",
          ingestionTimestamp,
          { key: input.key }
        )
      };
    try {
      const value = cloneJsonValue(input.value);
      const metadata = cloneMetadata(input.metadata);
      return {
        point: Object.freeze({
          key: input.key,
          value,
          quality,
          timestamp,
          ingestionTimestamp,
          ...(input.qualityDetail === undefined ? {} : { qualityDetail: input.qualityDetail }),
          ...(input.source === undefined ? {} : { source: input.source }),
          ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
          ...(metadata === undefined ? {} : { metadata })
        })
      };
    } catch {
      return {
        diagnostic: diagnostic(
          input.metadata === undefined ? "RUNTIME_INVALID_VALUE" : "RUNTIME_INVALID_METADATA",
          input.metadata === undefined
            ? "Runtime value must be JSON-safe."
            : "Runtime metadata must be JSON-safe.",
          ingestionTimestamp,
          { key: input.key }
        )
      };
    }
  }

  #commit(
    changes: readonly RuntimeChange[],
    timestamp: number,
    accepted: number,
    rejected: number,
    diagnostics: readonly RuntimeDiagnostic[]
  ): RuntimeBatchResult {
    if (changes.length === 0)
      return Object.freeze({
        changed: false,
        revision: this.#revision,
        accepted,
        rejected,
        diagnostics: Object.freeze([...diagnostics])
      });
    if (this.#revision >= Number.MAX_SAFE_INTEGER)
      throw new RuntimeEngineError(
        "RUNTIME_CONFIGURATION_INVALID",
        "Runtime revision exceeded the safe integer limit."
      );
    const previousRevision = this.#revision;
    for (const change of changes) {
      if (change.kind === "removed") this.#values.delete(change.key);
      else if (change.current !== undefined) this.#values.set(change.key, change.current);
    }
    this.#revision += 1;
    this.#snapshot = undefined;
    const ordered = [...changes].sort((left, right) => left.key.localeCompare(right.key));
    const changeSet: RuntimeChangeSet = Object.freeze({
      previousRevision,
      revision: this.#revision,
      timestamp,
      addedKeys: Object.freeze(
        ordered.filter(({ kind }) => kind === "added").map(({ key }) => key)
      ),
      updatedKeys: Object.freeze(
        ordered.filter(({ kind }) => kind === "updated").map(({ key }) => key)
      ),
      removedKeys: Object.freeze(
        ordered.filter(({ kind }) => kind === "removed").map(({ key }) => key)
      ),
      changes: Object.freeze(ordered)
    });
    this.#notify(changeSet);
    return Object.freeze({
      changed: true,
      revision: this.#revision,
      accepted,
      rejected,
      changeSet,
      diagnostics: Object.freeze([...diagnostics])
    });
  }

  #notify(changes: RuntimeChangeSet): void {
    this.#dispatching = true;
    try {
      const notification = Object.freeze({ snapshot: this.snapshot(), changes });
      for (const listener of [...this.#changeListeners.values()])
        try {
          listener(notification);
        } catch {
          this.#onDiagnostic?.(
            diagnostic(
              "RUNTIME_SUBSCRIBER_ERROR",
              "A runtime store subscriber failed.",
              this.#now(),
              { revision: this.#revision }
            )
          );
        }
      for (const change of changes.changes) {
        if (change.current === undefined) continue;
        const value = toRuntimeValue(change.current);
        for (const listener of [...this.#legacyListeners])
          try {
            listener(value);
          } catch {
            this.#onDiagnostic?.(
              diagnostic(
                "RUNTIME_SUBSCRIBER_ERROR",
                "A legacy tag-store subscriber failed.",
                this.#now(),
                { revision: this.#revision }
              )
            );
          }
      }
    } finally {
      this.#dispatching = false;
    }
  }

  #assertWritable(): void {
    this.#assertUsable();
    if (this.#dispatching)
      throw new RuntimeEngineError(
        "RUNTIME_REENTRANT_UPDATE",
        "Reentrant runtime store updates are not allowed."
      );
  }

  #assertUsable(): void {
    if (this.#disposed)
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime store is disposed.");
  }
}
