import type { ConnectionStyle, JsonValue, PropertyBinding, ScadaDocument } from "@web-scada/core";
import type { SymbolState } from "@web-scada/symbols";
import {
  type BindingEvaluator,
  type DataQuality,
  type ResolvedConnectionVisualState,
  type ResolvedNodeVisualState,
  type RuntimeDiagnosticCode,
  type RuntimeValue,
  type RuntimeVisualStateChange,
  type RuntimeVisualStateReader,
  type TagStore
} from "./contracts.js";

const SYMBOL_STATES: readonly SymbolState[] = [
  "normal",
  "active",
  "inactive",
  "running",
  "stopped",
  "warning",
  "alarm",
  "offline",
  "disabled"
];
const QUALITY_ORDER: Readonly<Record<DataQuality, number>> = {
  good: 0,
  uncertain: 1,
  unknown: 2,
  bad: 3,
  offline: 4
};

export interface RuntimeVisualStateResolverOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly store: TagStore;
  readonly evaluator: BindingEvaluator;
  readonly now: () => number;
  readonly onDiagnostic?: (code: RuntimeDiagnosticCode, message: string, bindingId: string) => void;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["boolean", "string"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function worstQuality(qualities: readonly DataQuality[], fallback: DataQuality): DataQuality {
  return qualities.reduce(
    (worst, quality) => (QUALITY_ORDER[quality] > QUALITY_ORDER[worst] ? quality : worst),
    fallback
  );
}

function bindingEntityId(binding: PropertyBinding): string | undefined {
  if ("nodeId" in binding.target) return binding.target.nodeId;
  if ("connectionId" in binding.target) return binding.target.connectionId;
  if ("entityId" in binding.target) return binding.target.entityId;
  return undefined;
}

function targetKey(binding: PropertyBinding): string {
  if (binding.target.type === "node-property") return binding.target.property;
  if (binding.target.type === "connection-property") return binding.target.property;
  return binding.target.type;
}

function connectionStyleValue(
  property: string,
  value: JsonValue
): Partial<ConnectionStyle> | undefined {
  if (property === "stroke" && typeof value === "string") return { stroke: value };
  if (
    ["strokeWidth", "opacity"].includes(property) &&
    typeof value === "number" &&
    Number.isFinite(value)
  )
    return { [property]: value };
  if (
    property === "dashPattern" &&
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  )
    return { dashPattern: value };
  if (
    property === "lineCap" &&
    typeof value === "string" &&
    ["butt", "round", "square"].includes(value)
  )
    return { lineCap: value as NonNullable<ConnectionStyle["lineCap"]> };
  if (
    property === "lineJoin" &&
    typeof value === "string" &&
    ["miter", "round", "bevel"].includes(value)
  )
    return { lineJoin: value as NonNullable<ConnectionStyle["lineJoin"]> };
  if (
    ["startMarker", "endMarker"].includes(property) &&
    typeof value === "string" &&
    ["none", "arrow", "circle", "diamond"].includes(value)
  )
    return { [property]: value };
  return undefined;
}

export class RuntimeVisualStateResolver implements RuntimeVisualStateReader {
  readonly #document: Readonly<ScadaDocument>;
  readonly #store: TagStore;
  readonly #evaluator: BindingEvaluator;
  readonly #now: () => number;
  readonly #onDiagnostic: RuntimeVisualStateResolverOptions["onDiagnostic"];
  readonly #bindingsByTag = new Map<string, readonly PropertyBinding[]>();
  readonly #nodeStates = new Map<string, ResolvedNodeVisualState>();
  readonly #connectionStates = new Map<string, ResolvedConnectionVisualState>();

  public constructor(options: RuntimeVisualStateResolverOptions) {
    this.#document = options.document;
    this.#store = options.store;
    this.#evaluator = options.evaluator;
    this.#now = options.now;
    this.#onDiagnostic = options.onDiagnostic;
    for (const binding of this.#document.bindings) {
      if (!binding.enabled || binding.source.type !== "tag") continue;
      const current = this.#bindingsByTag.get(binding.source.tagId) ?? [];
      this.#bindingsByTag.set(binding.source.tagId, [...current, binding]);
    }
    this.refresh();
  }

  public refresh(tagIds?: readonly string[]): RuntimeVisualStateChange {
    const bindings =
      tagIds === undefined
        ? this.#document.bindings.filter(({ enabled }) => enabled)
        : [...new Set(tagIds)].sort().flatMap((tagId) => this.#bindingsByTag.get(tagId) ?? []);
    const nodeIds = new Set<string>();
    const connectionIds = new Set<string>();
    for (const binding of bindings) {
      const id = bindingEntityId(binding);
      if (id === undefined) continue;
      if (
        binding.target.type === "connection-property" ||
        (binding.target.type === "visibility" &&
          this.#document.connections.some(({ id: connectionId }) => connectionId === id))
      )
        connectionIds.add(id);
      else nodeIds.add(id);
    }
    for (const nodeId of nodeIds) this.#resolveNode(nodeId);
    for (const connectionId of connectionIds) this.#resolveConnection(connectionId);
    return {
      nodeIds: [...nodeIds].sort(),
      connectionIds: [...connectionIds].sort()
    };
  }

  public getNodeState(nodeId: string): SymbolState | undefined {
    return this.#nodeStates.get(nodeId)?.state;
  }

  public getNodeProperties(nodeId: string): Readonly<Record<string, JsonValue>> | undefined {
    const properties = this.#nodeStates.get(nodeId)?.properties;
    return properties === undefined ? undefined : { ...properties };
  }

  public getNodeVisibility(nodeId: string): boolean | undefined {
    return this.#nodeStates.get(nodeId)?.visible;
  }

  public getNodeQuality(nodeId: string): DataQuality | undefined {
    return this.#nodeStates.get(nodeId)?.quality;
  }

  public getConnectionStyle(connectionId: string): Partial<ConnectionStyle> | undefined {
    const style = this.#connectionStates.get(connectionId)?.style;
    return style === undefined ? undefined : { ...style };
  }

  public getConnectionVisibility(connectionId: string): boolean | undefined {
    return this.#connectionStates.get(connectionId)?.visible;
  }

  public getConnectionQuality(connectionId: string): DataQuality | undefined {
    return this.#connectionStates.get(connectionId)?.quality;
  }

  #bindingsForEntity(entityId: string): readonly PropertyBinding[] {
    return this.#document.bindings.filter(
      (binding) => binding.enabled && bindingEntityId(binding) === entityId
    );
  }

  #resolveNode(nodeId: string): void {
    const properties: Record<string, JsonValue> = {};
    const qualities: DataQuality[] = [];
    let state: SymbolState | undefined;
    let visible: boolean | undefined;
    for (const binding of this.#bindingsForEntity(nodeId)) {
      if (binding.target.type === "connection-property") continue;
      const resolved = this.#resolveBinding(binding);
      if (resolved === undefined) continue;
      qualities.push(resolved.quality);
      if (binding.target.type === "node-property")
        properties[binding.target.property] = resolved.value;
      else if (binding.target.type === "text") properties.text = resolved.value;
      else if (binding.target.type === "visibility" && typeof resolved.value === "boolean")
        visible = resolved.value;
      else if (
        binding.target.type === "node-state" &&
        typeof resolved.value === "string" &&
        SYMBOL_STATES.includes(resolved.value as SymbolState)
      )
        state = resolved.value as SymbolState;
      else if (binding.target.type === "node-state")
        this.#invalidBinding(
          binding,
          "Node state binding did not resolve to a valid symbol state."
        );
    }
    const quality = worstQuality(qualities, this.#document.runtimeSettings.defaultQuality);
    if (quality === "offline") state = "offline";
    this.#nodeStates.set(nodeId, {
      properties,
      quality,
      ...(state === undefined ? {} : { state }),
      ...(visible === undefined ? {} : { visible })
    });
  }

  #resolveConnection(connectionId: string): void {
    let style: Partial<ConnectionStyle> = {};
    const qualities: DataQuality[] = [];
    let visible: boolean | undefined;
    for (const binding of this.#bindingsForEntity(connectionId)) {
      const resolved = this.#resolveBinding(binding);
      if (resolved === undefined) continue;
      qualities.push(resolved.quality);
      if (binding.target.type === "visibility" && typeof resolved.value === "boolean")
        visible = resolved.value;
      else if (binding.target.type === "connection-property") {
        const property = connectionStyleValue(binding.target.property, resolved.value);
        if (property === undefined)
          this.#invalidBinding(
            binding,
            "Connection property binding resolved to an invalid value."
          );
        else style = { ...style, ...property };
      }
    }
    this.#connectionStates.set(connectionId, {
      style,
      quality: worstQuality(qualities, this.#document.runtimeSettings.defaultQuality),
      ...(visible === undefined ? {} : { visible })
    });
  }

  #resolveBinding(
    binding: PropertyBinding
  ): { readonly value: JsonValue; readonly quality: DataQuality } | undefined {
    let runtimeValue: RuntimeValue | undefined;
    const source = binding.source;
    if (source.type === "tag") runtimeValue = this.#store.get(source.tagId);
    else if (source.type === "variable") {
      const variable = this.#document.variables.find(({ id }) => id === source.variableId);
      const value = variable?.value ?? variable?.defaultValue;
      if (value !== undefined)
        runtimeValue = {
          tagId: `variable:${source.variableId}`,
          value,
          dataType:
            typeof value === "object"
              ? "json"
              : typeof value === "number"
                ? "number"
                : typeof value === "boolean"
                  ? "boolean"
                  : "string",
          quality: "good",
          timestamp: new Date(this.#now()).toISOString()
        };
    } else if (source.type === "constant")
      runtimeValue = {
        tagId: `constant:${binding.id}`,
        value: source.value,
        dataType:
          typeof source.value === "object"
            ? "json"
            : typeof source.value === "number"
              ? "number"
              : typeof source.value === "boolean"
                ? "boolean"
                : "string",
        quality: "good",
        timestamp: new Date(this.#now()).toISOString()
      };
    else {
      this.#onDiagnostic?.(
        "BINDING_SOURCE_UNSUPPORTED",
        "Expression bindings are owned by the future Binding Engine.",
        binding.id
      );
      return undefined;
    }
    if (runtimeValue === undefined) {
      if (binding.fallback === undefined) return undefined;
      return { value: binding.fallback, quality: "unknown" };
    }
    if (
      ["bad", "offline", "unknown"].includes(runtimeValue.quality) &&
      binding.fallback !== undefined
    )
      return { value: binding.fallback, quality: runtimeValue.quality };
    try {
      const evaluated = this.#evaluator.evaluate({
        value: runtimeValue,
        targetProperty: targetKey(binding),
        binding
      });
      if (!isJsonValue(evaluated)) {
        this.#invalidBinding(binding, "Binding evaluator returned a non-JSON value.");
        return undefined;
      }
      return { value: evaluated, quality: runtimeValue.quality };
    } catch {
      this.#onDiagnostic?.("BINDING_EVALUATION_FAILED", "Binding evaluation failed.", binding.id);
      return binding.fallback === undefined
        ? undefined
        : { value: binding.fallback, quality: runtimeValue.quality };
    }
  }

  #invalidBinding(binding: PropertyBinding, message: string): void {
    this.#onDiagnostic?.("BINDING_VALUE_INVALID", message, binding.id);
  }
}
