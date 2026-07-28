import type { BindingTarget, JsonValue } from "@web-scada/core";
import type {
  BindingDiagnostic,
  BindingEvaluationResult,
  BindingEvaluationStatus
} from "./contracts.js";

export type VisualTargetKind = "node" | "connection";
export type VisualValueType = "boolean" | "number" | "string" | "json";

export interface VisualPropertyTarget {
  readonly kind: VisualTargetKind;
  readonly targetId: string;
  readonly property: string;
  readonly partId?: string;
}

export interface VisualPropertyDescriptor {
  readonly name: string;
  readonly acceptedTypes: readonly VisualValueType[];
  readonly targetKinds: readonly VisualTargetKind[];
  readonly nullable?: boolean;
  readonly defaultValue?: JsonValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: boolean;
  readonly enumValues?: readonly string[];
  readonly color?: boolean;
}

export interface VisualPropertyCandidate {
  readonly bindingId: string;
  readonly target: VisualPropertyTarget;
  readonly result: BindingEvaluationResult;
  /** Larger values win. Defaults to zero. */
  readonly priority?: number;
  /** Stable serialized declaration order. Smaller values win equal-priority ties. */
  readonly declarationOrder?: number;
}

export type ResolvedVisualPropertyStatus = "resolved" | "fallback" | "invalid" | "unresolved";

export interface ResolvedVisualProperty {
  readonly targetId: string;
  readonly targetKind: VisualTargetKind;
  readonly property: string;
  readonly value?: JsonValue;
  readonly sourceBindingId?: string;
  readonly status: ResolvedVisualPropertyStatus;
  readonly revision: number;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface ResolvedTargetVisualState {
  readonly targetId: string;
  readonly targetKind: VisualTargetKind;
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly entries: Readonly<Record<string, ResolvedVisualProperty>>;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface ResolvedVisualSnapshot {
  readonly revision: number;
  readonly targets: ReadonlyMap<string, ResolvedTargetVisualState>;
}

export interface VisualPropertyChange {
  readonly targetId: string;
  readonly targetKind: VisualTargetKind;
  readonly property: string;
  readonly previousValue?: JsonValue;
  readonly nextValue?: JsonValue;
  readonly kind: "added" | "updated" | "removed";
}

export interface VisualPropertyChangeSet {
  readonly previousRevision: number;
  readonly revision: number;
  readonly changes: readonly VisualPropertyChange[];
}

export interface VisualPropertyResolutionResult {
  readonly snapshot: ResolvedVisualSnapshot;
  readonly changeSet: VisualPropertyChangeSet;
  readonly diagnostics: readonly BindingDiagnostic[];
}

const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const STATUS_VALUES = [
  "normal",
  "active",
  "inactive",
  "running",
  "stopped",
  "warning",
  "alarm",
  "offline",
  "disabled"
] as const;
const COLOR_KEYWORDS = new Set([
  "transparent",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "gray",
  "grey",
  "yellow",
  "orange",
  "purple"
]);
const COLOR_PATTERN =
  /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.%+\-,\s]+\)|hsla?\(\s*[\d.%+\-,\s]+\)|theme:[a-z][a-z0-9._-]*)$/i;

function descriptor(
  name: string,
  acceptedTypes: readonly VisualValueType[],
  targetKinds: readonly VisualTargetKind[] = ["node", "connection"],
  extra: Omit<VisualPropertyDescriptor, "name" | "acceptedTypes" | "targetKinds"> = {}
): VisualPropertyDescriptor {
  return { name, acceptedTypes, targetKinds, ...extra };
}

export const BUILT_IN_VISUAL_PROPERTIES: readonly VisualPropertyDescriptor[] = Object.freeze([
  descriptor("visible", ["boolean"]),
  descriptor("opacity", ["number"], ["node", "connection"], { minimum: 0, maximum: 1 }),
  descriptor("fill", ["string"], ["node"], { color: true }),
  descriptor("stroke", ["string"], ["node", "connection"], { color: true }),
  descriptor("color", ["string"], ["node"], { color: true }),
  descriptor("textColor", ["string"], ["node"], { color: true }),
  descriptor("backgroundColor", ["string"], ["node"], { color: true }),
  descriptor("strokeWidth", ["number"], ["node", "connection"], { minimum: 0 }),
  descriptor("text", ["string"], ["node", "connection"]),
  descriptor("value", ["boolean", "number", "string", "json"], ["node"], { nullable: true }),
  descriptor("status", ["string"], ["node", "connection"], { enumValues: STATUS_VALUES }),
  descriptor("active", ["boolean"]),
  descriptor("open", ["boolean"], ["node"]),
  descriptor("enabled", ["boolean"], ["node"]),
  descriptor("disabled", ["boolean"]),
  descriptor("alarm", ["boolean"]),
  descriptor("warning", ["boolean"]),
  descriptor("offline", ["boolean"]),
  descriptor("level", ["number"], ["node"], { minimum: 0, maximum: 100 }),
  descriptor("speed", ["number"]),
  descriptor("flow", ["number"]),
  descriptor("rotation", ["number"], ["node"]),
  descriptor("scale", ["number"], ["node"], { minimum: 0, exclusiveMinimum: true }),
  descriptor("animationTrigger", ["boolean", "string"]),
  descriptor("direction", ["string"], ["node", "connection"], {
    enumValues: ["none", "forward", "reverse", "bidirectional"]
  })
]);

function freezeDescriptor(input: Readonly<VisualPropertyDescriptor>): VisualPropertyDescriptor {
  return Object.freeze({
    ...input,
    acceptedTypes: Object.freeze([...input.acceptedTypes]),
    targetKinds: Object.freeze([...input.targetKinds]),
    ...(input.enumValues === undefined ? {} : { enumValues: Object.freeze([...input.enumValues]) })
  });
}

export class DuplicateVisualPropertyError extends Error {
  public constructor(public readonly property: string) {
    super(`Visual property is already registered: ${property}`);
    this.name = "DuplicateVisualPropertyError";
  }
}

export class VisualPropertyRegistry {
  readonly #descriptors = new Map<string, VisualPropertyDescriptor>();

  public constructor(descriptors: readonly Readonly<VisualPropertyDescriptor>[] = []) {
    descriptors.forEach((entry) => {
      this.register(entry);
    });
  }

  public register(input: Readonly<VisualPropertyDescriptor>): void {
    const name = input.name.trim();
    if (
      name === "" ||
      name.includes(".") ||
      name.includes("/") ||
      UNSAFE_SEGMENTS.has(name) ||
      input.acceptedTypes.length === 0 ||
      input.targetKinds.length === 0
    )
      throw new TypeError("Visual property descriptor is invalid.");
    if (this.#descriptors.has(name)) throw new DuplicateVisualPropertyError(name);
    this.#descriptors.set(name, freezeDescriptor({ ...input, name }));
  }

  public get(name: string): VisualPropertyDescriptor | undefined {
    return this.#descriptors.get(name);
  }

  public list(): readonly VisualPropertyDescriptor[] {
    return Object.freeze(
      [...this.#descriptors.values()].sort((left, right) => left.name.localeCompare(right.name))
    );
  }
}

export function createBuiltInVisualPropertyRegistry(): VisualPropertyRegistry {
  return new VisualPropertyRegistry(BUILT_IN_VISUAL_PROPERTIES);
}

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  target?: Partial<VisualPropertyTarget>,
  bindingId?: string,
  severity: BindingDiagnostic["severity"] = "error"
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity,
    message,
    recoverable: true,
    ...(bindingId === undefined ? {} : { bindingId }),
    ...(target?.property === undefined ? {} : { path: target.property }),
    context: Object.freeze({
      ...(target?.targetId === undefined ? {} : { targetId: target.targetId }),
      ...(target?.kind === undefined ? {} : { targetKind: target.kind }),
      ...(target?.property === undefined ? {} : { property: target.property })
    })
  });
}

export function getVisualTargetKey(target: Readonly<VisualPropertyTarget>): string {
  return `${target.kind}:${target.targetId.length}:${target.targetId}`;
}

export function validateVisualPropertyTarget(
  target: Readonly<VisualPropertyTarget>,
  registry: VisualPropertyRegistry
): readonly BindingDiagnostic[] {
  if (target.targetId.trim() === "" || target.property.trim() === "")
    return [diagnostic("INVALID_VISUAL_TARGET", "Target ID and property are required.", target)];
  const segments = [
    target.targetId,
    target.property,
    ...(target.partId === undefined ? [] : [target.partId])
  ].flatMap((value) => value.split(/[./]/u));
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment)))
    return [diagnostic("UNSAFE_VISUAL_TARGET", "Target contains an unsafe path segment.", target)];
  if (!["node", "connection"].includes(target.kind))
    return [diagnostic("UNSUPPORTED_VISUAL_TARGET", "Visual target kind is unsupported.", target)];
  const property = registry.get(target.property);
  if (property === undefined)
    return [diagnostic("UNKNOWN_VISUAL_PROPERTY", "Visual property is not registered.", target)];
  if (!property.targetKinds.includes(target.kind))
    return [
      diagnostic(
        "UNSUPPORTED_VISUAL_TARGET",
        "Visual property is not supported by this target kind.",
        target
      )
    ];
  return Object.freeze([]);
}

export function normalizeBindingTarget(
  target: Readonly<BindingTarget>,
  entityKind?: VisualTargetKind
): VisualPropertyTarget | undefined {
  switch (target.type) {
    case "node-property":
      return Object.freeze({ kind: "node", targetId: target.nodeId, property: target.property });
    case "node-state":
      return Object.freeze({ kind: "node", targetId: target.nodeId, property: "status" });
    case "connection-property":
      return Object.freeze({
        kind: "connection",
        targetId: target.connectionId,
        property: target.property
      });
    case "text":
      return Object.freeze({ kind: "node", targetId: target.nodeId, property: "text" });
    case "visibility":
      return entityKind === undefined
        ? undefined
        : Object.freeze({ kind: entityKind, targetId: target.entityId, property: "visible" });
  }
}

function valueType(value: JsonValue): VisualValueType {
  if (value === null || Array.isArray(value) || typeof value === "object") return "json";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function safeColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return COLOR_KEYWORDS.has(normalized) || COLOR_PATTERN.test(normalized);
}

function isSafeJson(value: unknown, seen = new WeakSet(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 32 || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  seen.add(value);
  const entries: readonly unknown[] = Array.isArray(value) ? value : Object.values(value);
  return entries.length <= 10_000 && entries.every((entry) => isSafeJson(entry, seen, depth + 1));
}

function validateValue(
  value: unknown,
  target: VisualPropertyTarget,
  property: VisualPropertyDescriptor,
  bindingId?: string
): readonly BindingDiagnostic[] {
  if (!isSafeJson(value))
    return [
      diagnostic(
        "INVALID_VISUAL_PROPERTY_TYPE",
        "Visual property must be a finite, acyclic JSON value.",
        target,
        bindingId
      )
    ];
  if (value === null)
    return property.nullable === true
      ? []
      : [
          diagnostic(
            "NULL_VISUAL_PROPERTY_NOT_ALLOWED",
            "Null is not allowed for this visual property.",
            target,
            bindingId
          )
        ];
  if (!property.acceptedTypes.includes(valueType(value)))
    return [
      diagnostic(
        "INVALID_VISUAL_PROPERTY_TYPE",
        `Visual property expects ${property.acceptedTypes.join(" or ")}.`,
        target,
        bindingId
      )
    ];
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      return [
        diagnostic(
          "NON_FINITE_VISUAL_NUMBER",
          "Visual numeric values must be finite.",
          target,
          bindingId
        )
      ];
    if (
      (property.minimum !== undefined &&
        (property.exclusiveMinimum === true
          ? value <= property.minimum
          : value < property.minimum)) ||
      (property.maximum !== undefined && value > property.maximum)
    )
      return [
        diagnostic(
          "INVALID_VISUAL_PROPERTY_RANGE",
          "Visual property value is outside its supported range.",
          target,
          bindingId
        )
      ];
  }
  if (
    typeof value === "string" &&
    property.enumValues !== undefined &&
    !property.enumValues.includes(value)
  )
    return [
      diagnostic(
        "INVALID_VISUAL_PROPERTY_TYPE",
        "Visual property value is not a supported enum member.",
        target,
        bindingId
      )
    ];
  if (typeof value === "string" && property.color === true && !safeColor(value))
    return [
      diagnostic(
        "UNSAFE_VISUAL_COLOR",
        "Color must use an approved literal or theme token.",
        target,
        bindingId
      )
    ];
  return Object.freeze([]);
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      (left as readonly JsonValue[]).every((entry, index) =>
        jsonEqual(entry, (right as readonly JsonValue[])[index])
      )
    );
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(
          (left as Readonly<Record<string, JsonValue>>)[key],
          (right as Readonly<Record<string, JsonValue>>)[key]
        )
    )
  );
}

function deepFreeze(value: JsonValue): JsonValue {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((entry) => deepFreeze(entry));
    Object.freeze(value);
  }
  return value;
}

function status(status: BindingEvaluationStatus): ResolvedVisualPropertyStatus {
  if (status === "resolved") return "resolved";
  if (status === "fallback") return "fallback";
  if (status === "unresolved" || status === "disabled") return "unresolved";
  return "invalid";
}

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  public constructor(private readonly source: ReadonlyMap<K, V>) {}
  public get size(): number {
    return this.source.size;
  }
  public get(key: K): V | undefined {
    return this.source.get(key);
  }
  public has(key: K): boolean {
    return this.source.has(key);
  }
  public entries(): MapIterator<[K, V]> {
    return this.source.entries();
  }
  public keys(): MapIterator<K> {
    return this.source.keys();
  }
  public values(): MapIterator<V> {
    return this.source.values();
  }
  public forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown
  ): void {
    this.source.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }
  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
  public readonly [Symbol.toStringTag] = "ReadonlyMap";
}

export class VisualPropertyResolver {
  readonly #registry: VisualPropertyRegistry;
  #revision = 0;
  #snapshot: ResolvedVisualSnapshot = Object.freeze({
    revision: 0,
    targets: new ImmutableMapView(new Map())
  });

  public constructor(registry: VisualPropertyRegistry = createBuiltInVisualPropertyRegistry()) {
    this.#registry = registry;
  }

  public get snapshot(): ResolvedVisualSnapshot {
    return this.#snapshot;
  }

  public reset(): void {
    this.#revision = 0;
    this.#snapshot = Object.freeze({ revision: 0, targets: new ImmutableMapView(new Map()) });
  }

  public resolve(
    candidates: readonly Readonly<VisualPropertyCandidate>[],
    designValues: ReadonlyMap<string, Readonly<Record<string, JsonValue>>> = new Map()
  ): VisualPropertyResolutionResult {
    const grouped = new Map<string, VisualPropertyCandidate[]>();
    for (const candidate of candidates) {
      const key = `${getVisualTargetKey(candidate.target)}/${candidate.target.property}`;
      const current = grouped.get(key) ?? [];
      current.push(candidate);
      grouped.set(key, current);
    }
    const targetEntries = new Map<string, Record<string, ResolvedVisualProperty>>();
    const allDiagnostics: BindingDiagnostic[] = [];
    for (const group of grouped.values()) {
      const ordered = [...group].sort(
        (left, right) =>
          (right.priority ?? 0) - (left.priority ?? 0) ||
          (left.declarationOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.declarationOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.bindingId.localeCompare(right.bindingId)
      );
      const winner = ordered.at(0);
      if (winner === undefined) continue;
      const diagnostics = [...validateVisualPropertyTarget(winner.target, this.#registry)];
      if (
        ordered.length > 1 &&
        (ordered[0]?.priority ?? 0) === (ordered[1]?.priority ?? 0) &&
        (ordered[0]?.declarationOrder ?? Number.MAX_SAFE_INTEGER) ===
          (ordered[1]?.declarationOrder ?? Number.MAX_SAFE_INTEGER)
      )
        diagnostics.push(
          diagnostic(
            "CONFLICTING_VISUAL_BINDINGS",
            "Equal-precedence visual bindings were resolved by stable binding ID.",
            winner.target,
            winner.bindingId,
            "warning"
          )
        );
      const property = this.#registry.get(winner.target.property);
      let resolvedValue = winner.result.value;
      if (diagnostics.length === 0 && property !== undefined && resolvedValue !== undefined)
        diagnostics.push(
          ...validateValue(resolvedValue, winner.target, property, winner.bindingId)
        );
      const design = designValues.get(getVisualTargetKey(winner.target))?.[winner.target.property];
      const fallback =
        winner.result.status === "fallback" ? resolvedValue : (design ?? property?.defaultValue);
      if (
        (winner.result.status !== "resolved" && winner.result.status !== "fallback") ||
        resolvedValue === undefined ||
        diagnostics.some(({ severity }) => severity === "error")
      )
        resolvedValue = fallback;
      const entryStatus =
        resolvedValue === undefined
          ? status(winner.result.status)
          : resolvedValue === winner.result.value && diagnostics.length === 0
            ? status(winner.result.status)
            : "fallback";
      const entry = Object.freeze({
        targetId: winner.target.targetId,
        targetKind: winner.target.kind,
        property: winner.target.property,
        ...(resolvedValue === undefined
          ? {}
          : { value: deepFreeze(structuredClone(resolvedValue)) }),
        sourceBindingId: winner.bindingId,
        status: entryStatus,
        revision: this.#revision + 1,
        diagnostics: Object.freeze([...winner.result.diagnostics, ...diagnostics])
      }) satisfies ResolvedVisualProperty;
      allDiagnostics.push(...entry.diagnostics);
      const targetKey = getVisualTargetKey(winner.target);
      const entries: Record<string, ResolvedVisualProperty> =
        targetEntries.get(targetKey) ??
        (Object.create(null) as Record<string, ResolvedVisualProperty>);
      entries[winner.target.property] = entry;
      targetEntries.set(targetKey, entries);
    }
    const nextTargets = new Map<string, ResolvedTargetVisualState>();
    for (const [targetKey, entries] of targetEntries) {
      const first = Object.values(entries).at(0);
      if (first === undefined) continue;
      const properties = Object.create(null) as Record<string, JsonValue>;
      const diagnostics: BindingDiagnostic[] = [];
      for (const [name, entry] of Object.entries(entries)) {
        if (entry.value !== undefined) properties[name] = entry.value;
        diagnostics.push(...entry.diagnostics);
      }
      nextTargets.set(
        targetKey,
        Object.freeze({
          targetId: first.targetId,
          targetKind: first.targetKind,
          properties: Object.freeze(properties),
          entries: Object.freeze(entries),
          diagnostics: Object.freeze(diagnostics)
        })
      );
    }
    const changes: VisualPropertyChange[] = [];
    const targetKeys = new Set([...this.#snapshot.targets.keys(), ...nextTargets.keys()]);
    for (const targetKey of [...targetKeys].sort()) {
      const previous = this.#snapshot.targets.get(targetKey);
      const next = nextTargets.get(targetKey);
      const propertyNames = new Set([
        ...Object.keys(previous?.properties ?? {}),
        ...Object.keys(next?.properties ?? {})
      ]);
      for (const property of [...propertyNames].sort()) {
        const previousValue = previous?.properties[property];
        const nextValue = next?.properties[property];
        if (jsonEqual(previousValue, nextValue)) continue;
        const owner = next ?? previous;
        if (owner === undefined) continue;
        changes.push(
          Object.freeze({
            targetId: owner.targetId,
            targetKind: owner.targetKind,
            property,
            ...(previousValue === undefined ? {} : { previousValue }),
            ...(nextValue === undefined ? {} : { nextValue }),
            kind:
              previousValue === undefined
                ? "added"
                : nextValue === undefined
                  ? "removed"
                  : "updated"
          })
        );
      }
    }
    const previousRevision = this.#revision;
    this.#revision += 1;
    this.#snapshot = Object.freeze({
      revision: this.#revision,
      targets: new ImmutableMapView(nextTargets)
    });
    return Object.freeze({
      snapshot: this.#snapshot,
      changeSet: Object.freeze({
        previousRevision,
        revision: this.#revision,
        changes: Object.freeze(changes)
      }),
      diagnostics: Object.freeze(allDiagnostics)
    });
  }
}
