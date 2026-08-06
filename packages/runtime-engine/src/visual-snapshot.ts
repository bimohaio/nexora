import type { ConnectionStyle, JsonValue, ScadaDocument } from "@web-scada/core";
import type { SymbolState } from "@web-scada/symbols";
import type {
  DataQuality,
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  ResolvedSymbolVisualState,
  RuntimeVisualCommitEvent,
  RuntimeVisualSnapshot,
  RuntimeVisualSnapshotDiff,
  RuntimeVisualStateChange,
  RuntimeVisualStateReader
} from "./contracts.js";

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #map: ReadonlyMap<K, V>;

  public constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  public get size(): number {
    return this.#map.size;
  }

  public entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  public forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void): void {
    this.#map.forEach((value, key) => {
      callbackfn(value, key, this);
    });
  }

  public get(key: K): V | undefined {
    return this.#map.get(key);
  }

  public has(key: K): boolean {
    return this.#map.has(key);
  }

  public keys(): MapIterator<K> {
    return this.#map.keys();
  }

  public values(): MapIterator<V> {
    return this.#map.values();
  }

  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }

  public readonly [Symbol.toStringTag] = "ImmutableMapView";
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneJson));
  const record = value as Readonly<Record<string, JsonValue>>;
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(record).sort()) {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError("Unsafe runtime visual-state key.");
    result[key] = cloneJson(record[key] as JsonValue);
  }
  return Object.freeze(result);
}

function cloneRecord(
  value: Readonly<Record<string, JsonValue>>
): Readonly<Record<string, JsonValue>> {
  return cloneJson(value) as Readonly<Record<string, JsonValue>>;
}

function freezeNodeState(reader: RuntimeVisualStateReader, id: string): ResolvedNodeVisualState {
  const resolved = reader.getNodeVisualState?.(id);
  if (resolved !== undefined) return resolved;
  const properties = cloneRecord(reader.getNodeProperties(id) ?? {});
  const state = reader.getNodeState(id);
  const visible = reader.getNodeVisibility(id);
  return Object.freeze({
    properties,
    quality: reader.getNodeQuality(id) ?? "unknown",
    ...(state === undefined ? {} : { state }),
    ...(visible === undefined ? {} : { visible })
  });
}

function freezeConnectionState(
  reader: RuntimeVisualStateReader,
  id: string
): ResolvedConnectionVisualState {
  const style = cloneRecord(reader.getConnectionStyle(id) ?? {}) as Partial<ConnectionStyle>;
  const visible = reader.getConnectionVisibility(id);
  return Object.freeze({
    style,
    quality: reader.getConnectionQuality(id) ?? "unknown",
    ...(visible === undefined ? {} : { visible })
  });
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
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(
          (left as Readonly<Record<string, JsonValue>>)[key] as JsonValue,
          (right as Readonly<Record<string, JsonValue>>)[key] as JsonValue
        )
    )
  );
}

function nodeEqual(left: ResolvedNodeVisualState, right: ResolvedNodeVisualState): boolean {
  if (!(
    left.state === right.state &&
    left.visible === right.visible &&
    left.quality === right.quality &&
    jsonEqual(left.properties, right.properties) &&
    left.alarmState === right.alarmState &&
    left.alarmPresentation === right.alarmPresentation
  ))
    return false;
  const leftSymbol = "effectiveState" in left ? (left as ResolvedSymbolVisualState) : undefined;
  const rightSymbol = "effectiveState" in right ? (right as ResolvedSymbolVisualState) : undefined;
  if (leftSymbol === undefined || rightSymbol === undefined) return leftSymbol === rightSymbol;
  return SYMBOL_VISUAL_FIELDS.every((field) =>
    jsonEqual(leftSymbol[field] as JsonValue, rightSymbol[field] as JsonValue)
  );
}

const SYMBOL_VISUAL_FIELDS = [
  "effectiveState",
  "active",
  "running",
  "open",
  "enabled",
  "disabled",
  "offline",
  "warning",
  "alarm",
  "level",
  "speed",
  "flow",
  "direction",
  "text",
  "value",
  "overrides"
] as const satisfies readonly (keyof ResolvedSymbolVisualState)[];

function connectionEqual(
  left: ResolvedConnectionVisualState,
  right: ResolvedConnectionVisualState
): boolean {
  return (
    left.visible === right.visible &&
    left.quality === right.quality &&
    jsonEqual(left.style, right.style) &&
    left.alarmState === right.alarmState &&
    left.alarmPresentation === right.alarmPresentation
  );
}

function changedKeys(
  previous: Readonly<Record<string, JsonValue>>,
  current: Readonly<Record<string, JsonValue>>
): readonly string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Object.freeze(
    [...keys].filter((key) => {
      if (!(key in previous) || !(key in current)) return true;
      return !jsonEqual(previous[key] as JsonValue, current[key] as JsonValue);
    })
  );
}

function changedNodeKeys(
  previous: ResolvedNodeVisualState,
  current: ResolvedNodeVisualState
): readonly string[] {
  const keys = [...changedKeys(previous.properties, current.properties)];
  if (previous.state !== current.state) keys.push("state");
  if (previous.visible !== current.visible) keys.push("visible");
  if (previous.quality !== current.quality) keys.push("quality");
  if (previous.alarmState !== current.alarmState) keys.push("alarmState");
  if (previous.alarmPresentation !== current.alarmPresentation) keys.push("alarmPresentation");
  const previousSymbol =
    "effectiveState" in previous ? (previous as ResolvedSymbolVisualState) : undefined;
  const currentSymbol =
    "effectiveState" in current ? (current as ResolvedSymbolVisualState) : undefined;
  if (previousSymbol !== undefined && currentSymbol !== undefined)
    for (const field of SYMBOL_VISUAL_FIELDS)
      if (!jsonEqual(previousSymbol[field] as JsonValue, currentSymbol[field] as JsonValue))
        keys.push(field);
  return Object.freeze(keys);
}

function changedConnectionKeys(
  previous: ResolvedConnectionVisualState,
  current: ResolvedConnectionVisualState
): readonly string[] {
  const keys = [...changedKeys(previous.style, current.style)];
  if (previous.visible !== current.visible) keys.push("visible");
  if (previous.quality !== current.quality) keys.push("quality");
  if (previous.alarmState !== current.alarmState) keys.push("alarmState");
  if (previous.alarmPresentation !== current.alarmPresentation) keys.push("alarmPresentation");
  return Object.freeze(keys);
}

class VisualSnapshot implements RuntimeVisualSnapshot {
  public readonly nodes: ReadonlyMap<string, ResolvedNodeVisualState>;
  public readonly connections: ReadonlyMap<string, ResolvedConnectionVisualState>;

  public constructor(
    public readonly revision: number,
    public readonly timestamp: number,
    nodes: ReadonlyMap<string, ResolvedNodeVisualState>,
    connections: ReadonlyMap<string, ResolvedConnectionVisualState>
  ) {
    this.nodes = new ImmutableMapView(nodes);
    this.connections = new ImmutableMapView(connections);
    Object.freeze(this);
  }

  public getNodeState(nodeId: string): SymbolState | undefined {
    return this.nodes.get(nodeId)?.state;
  }
  public getNodeVisualState(nodeId: string): ResolvedSymbolVisualState | undefined {
    const state = this.nodes.get(nodeId);
    return state !== undefined && "effectiveState" in state
      ? (state as ResolvedSymbolVisualState)
      : undefined;
  }
  public getNodeProperties(nodeId: string): Readonly<Record<string, JsonValue>> | undefined {
    return this.nodes.get(nodeId)?.properties;
  }
  public getNodeVisibility(nodeId: string): boolean | undefined {
    return this.nodes.get(nodeId)?.visible;
  }
  public getNodeQuality(nodeId: string): DataQuality | undefined {
    return this.nodes.get(nodeId)?.quality;
  }
  public getConnectionStyle(connectionId: string): Partial<ConnectionStyle> | undefined {
    return this.connections.get(connectionId)?.style;
  }
  public getConnectionVisibility(connectionId: string): boolean | undefined {
    return this.connections.get(connectionId)?.visible;
  }
  public getConnectionQuality(connectionId: string): DataQuality | undefined {
    return this.connections.get(connectionId)?.quality;
  }
}

function frozenIds(ids: Iterable<string>): readonly string[] {
  return Object.freeze([...ids].sort());
}

export class RuntimeVisualSnapshotRepository {
  readonly #document: Readonly<ScadaDocument>;
  readonly #reader: RuntimeVisualStateReader;
  readonly #now: () => number;
  #snapshot: RuntimeVisualSnapshot;

  public constructor(
    document: Readonly<ScadaDocument>,
    reader: RuntimeVisualStateReader,
    now: () => number
  ) {
    this.#document = document;
    this.#reader = reader;
    this.#now = now;
    const nodes = new Map(
      document.nodes.map((node) => [node.id, freezeNodeState(reader, node.id)] as const)
    );
    const connections = new Map(
      document.connections.map(
        (connection) => [connection.id, freezeConnectionState(reader, connection.id)] as const
      )
    );
    this.#snapshot = new VisualSnapshot(0, this.#validNow(), nodes, connections);
  }

  public get snapshot(): RuntimeVisualSnapshot {
    return this.#snapshot;
  }

  public commit(
    affected: RuntimeVisualStateChange,
    reset = false
  ): RuntimeVisualCommitEvent | undefined {
    const previousSnapshot = this.#snapshot;
    const nodes = new Map(previousSnapshot.nodes);
    const connections = new Map(previousSnapshot.connections);
    const addedNodeIds: string[] = [];
    const updatedNodeIds: string[] = [];
    const removedNodeIds: string[] = [];
    const addedConnectionIds: string[] = [];
    const updatedConnectionIds: string[] = [];
    const removedConnectionIds: string[] = [];
    const changedNodeProperties: Record<string, readonly string[]> = Object.create(null) as Record<
      string,
      readonly string[]
    >;
    const changedConnectionProperties: Record<string, readonly string[]> = Object.create(
      null
    ) as Record<string, readonly string[]>;
    const documentNodeIds = new Set(this.#document.nodes.map(({ id }) => id));
    const documentConnectionIds = new Set(this.#document.connections.map(({ id }) => id));
    const nodeIds = reset
      ? new Set([...nodes.keys(), ...documentNodeIds])
      : new Set(affected.nodeIds);
    const connectionIds = reset
      ? new Set([...connections.keys(), ...documentConnectionIds])
      : new Set(affected.connectionIds);

    for (const id of nodeIds) {
      const previous = nodes.get(id);
      if (!documentNodeIds.has(id)) {
        if (nodes.delete(id)) removedNodeIds.push(id);
        continue;
      }
      const next = freezeNodeState(this.#reader, id);
      if (previous === undefined) {
        nodes.set(id, next);
        addedNodeIds.push(id);
      } else if (!nodeEqual(previous, next)) {
        nodes.set(id, next);
        updatedNodeIds.push(id);
        changedNodeProperties[id] = changedNodeKeys(previous, next);
      }
    }
    for (const id of connectionIds) {
      const previous = connections.get(id);
      if (!documentConnectionIds.has(id)) {
        if (connections.delete(id)) removedConnectionIds.push(id);
        continue;
      }
      const next = freezeConnectionState(this.#reader, id);
      if (previous === undefined) {
        connections.set(id, next);
        addedConnectionIds.push(id);
      } else if (!connectionEqual(previous, next)) {
        connections.set(id, next);
        updatedConnectionIds.push(id);
        changedConnectionProperties[id] = changedConnectionKeys(previous, next);
      }
    }
    if (
      addedNodeIds.length +
        updatedNodeIds.length +
        removedNodeIds.length +
        addedConnectionIds.length +
        updatedConnectionIds.length +
        removedConnectionIds.length ===
      0
    )
      return undefined;
    const revision = previousSnapshot.revision + 1;
    const snapshot = new VisualSnapshot(revision, this.#validNow(), nodes, connections);
    const diff: RuntimeVisualSnapshotDiff = Object.freeze({
      fromRevision: previousSnapshot.revision,
      toRevision: revision,
      addedNodeIds: frozenIds(addedNodeIds),
      updatedNodeIds: frozenIds(updatedNodeIds),
      removedNodeIds: frozenIds(removedNodeIds),
      addedConnectionIds: frozenIds(addedConnectionIds),
      updatedConnectionIds: frozenIds(updatedConnectionIds),
      removedConnectionIds: frozenIds(removedConnectionIds),
      reset,
      changedNodeProperties: Object.freeze(changedNodeProperties),
      changedConnectionProperties: Object.freeze(changedConnectionProperties)
    });
    this.#snapshot = snapshot;
    return Object.freeze({ previousSnapshot, snapshot, diff });
  }

  #validNow(): number {
    const timestamp = this.#now();
    if (!Number.isFinite(timestamp))
      throw new TypeError("Runtime clock must return a finite value.");
    return timestamp;
  }
}
