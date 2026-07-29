import type { JsonValue } from "@web-scada/core";
import {
  SYMBOL_STATES,
  type SymbolDefinition,
  type SymbolRegistry,
  type SymbolState
} from "@web-scada/symbols";
import type {
  DataQuality,
  ResolvedSymbolVisualState,
  RuntimeDiagnosticCode,
  RuntimeSymbolVisualInput,
  RuntimeVisualDirection,
  RuntimeVisualTarget,
  SymbolVisualCapabilities
} from "./contracts.js";

const STATES: readonly SymbolState[] = SYMBOL_STATES;
const QUALITIES: readonly DataQuality[] = ["good", "uncertain", "bad", "offline", "unknown"];
const DIRECTIONS: readonly RuntimeVisualDirection[] = [
  "none",
  "forward",
  "reverse",
  "bidirectional"
];
const FLAG_FIELDS = [
  "active",
  "running",
  "open",
  "enabled",
  "disabled",
  "offline",
  "warning",
  "alarm"
] as const;
const NUMBER_FIELDS = ["level", "speed", "flow"] as const;
type Diagnostic = (
  code: RuntimeDiagnosticCode,
  message: string,
  symbolId: string,
  property?: string
) => void;

export interface RuntimeSymbolVisualResolverOptions {
  readonly targets: readonly RuntimeVisualTarget[];
  readonly symbols: SymbolRegistry;
  readonly onDiagnostic?: Diagnostic;
}

function hasCapability(
  definition: SymbolDefinition,
  capability: string,
  property = capability
): boolean {
  return (
    definition.runtimeCapabilities?.includes(
      capability as NonNullable<SymbolDefinition["runtimeCapabilities"]>[number]
    ) === true ||
    definition.supportedStates.includes(capability as SymbolState) ||
    definition.bindableProperties.some(({ key }) => key === property) ||
    definition.editableProperties.some(({ key }) => key === property)
  );
}

export function resolveSymbolVisualCapabilities(
  definition: SymbolDefinition
): SymbolVisualCapabilities {
  return Object.freeze({
    supportsActive: hasCapability(definition, "active"),
    supportsRunning: hasCapability(definition, "running"),
    supportsOpen: hasCapability(definition, "open"),
    supportsEnabled: hasCapability(definition, "enabled") || hasCapability(definition, "disabled"),
    supportsDisabled: hasCapability(definition, "disabled"),
    supportsOffline: hasCapability(definition, "offline"),
    supportsWarning: hasCapability(definition, "warning"),
    supportsAlarm: hasCapability(definition, "alarm"),
    supportsLevel: hasCapability(definition, "level"),
    supportsSpeed: hasCapability(definition, "speed"),
    supportsFlow: hasCapability(definition, "flow"),
    supportsDirection: hasCapability(definition, "direction"),
    supportsText: hasCapability(definition, "text"),
    supportsValue: hasCapability(definition, "value"),
    supportsRotation: hasCapability(definition, "rotation"),
    supportsAnimation: hasCapability(definition, "animation")
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, freezeJson(entry)])
    )
  );
}

function equalState(
  left: ResolvedSymbolVisualState | undefined,
  right: Omit<ResolvedSymbolVisualState, "revision">
): boolean {
  if (left === undefined) return false;
  return JSON.stringify({ ...left, revision: 0 }) === JSON.stringify({ ...right, revision: 0 });
}

function sourceOrder(left: RuntimeSymbolVisualInput, right: RuntimeSymbolVisualInput): number {
  const priority = (left.priority ?? 0) - (right.priority ?? 0);
  if (priority !== 0) return priority;
  const timestamp = (left.timestamp ?? 0) - (right.timestamp ?? 0);
  if (timestamp !== 0) return timestamp;
  return (left.sourceId ?? "").localeCompare(right.sourceId ?? "");
}

function mergeSources(
  sources: readonly RuntimeSymbolVisualInput[],
  override: Readonly<RuntimeSymbolVisualInput> | undefined
): RuntimeSymbolVisualInput {
  const merged: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};
  for (const source of [...sources].sort(sourceOrder)) {
    Object.assign(merged, source);
    Object.assign(properties, source.properties);
  }
  if (override !== undefined) {
    Object.assign(merged, override);
    Object.assign(properties, override.properties);
  }
  if (Object.keys(properties).length > 0) merged.properties = properties;
  return merged;
}

function validOverride(override: RuntimeSymbolVisualInput): boolean {
  return (
    FLAG_FIELDS.every(
      (field) => override[field] === undefined || typeof override[field] === "boolean"
    ) &&
    NUMBER_FIELDS.every(
      (field) =>
        override[field] === undefined ||
        (typeof override[field] === "number" && Number.isFinite(override[field]))
    ) &&
    (override.state === undefined ||
      (typeof override.state === "string" && STATES.includes(override.state as SymbolState))) &&
    (override.quality === undefined ||
      (typeof override.quality === "string" &&
        QUALITIES.includes(override.quality as DataQuality))) &&
    (override.visible === undefined || typeof override.visible === "boolean") &&
    (override.text === undefined || typeof override.text === "string") &&
    (override.value === undefined || isJsonValue(override.value)) &&
    (override.direction === undefined ||
      (typeof override.direction === "string" &&
        DIRECTIONS.includes(override.direction as RuntimeVisualDirection))) &&
    Object.values(override.properties ?? {}).every(isJsonValue)
  );
}

function freezeInput(input: RuntimeSymbolVisualInput): Readonly<RuntimeSymbolVisualInput> {
  const properties = Object.fromEntries(
    Object.entries(input.properties ?? {}).map(([key, value]) => [
      key,
      isJsonValue(value) ? freezeJson(value) : value
    ])
  );
  return Object.freeze({
    ...input,
    ...(input.value !== undefined && isJsonValue(input.value)
      ? { value: freezeJson(input.value) }
      : {}),
    ...(Object.keys(properties).length === 0 ? {} : { properties: Object.freeze(properties) })
  });
}

export class RuntimeSymbolVisualStateResolver {
  readonly #targets = new Map<string, string>();
  readonly #symbols: SymbolRegistry;
  readonly #onDiagnostic: Diagnostic | undefined;
  readonly #cache = new Map<string, ResolvedSymbolVisualState>();
  readonly #sources = new Map<string, readonly RuntimeSymbolVisualInput[]>();
  readonly #overrides = new Map<string, Readonly<RuntimeSymbolVisualInput>>();
  #revision = 0;
  #resolutionCount = 0;

  public constructor(options: RuntimeSymbolVisualResolverOptions) {
    this.#symbols = options.symbols;
    this.#onDiagnostic = options.onDiagnostic;
    for (const target of options.targets) this.#targets.set(target.symbolId, target.symbolType);
  }

  public get revision(): number {
    return this.#revision;
  }

  public get cacheSize(): number {
    return this.#cache.size;
  }

  public get resolutionCount(): number {
    return this.#resolutionCount;
  }

  public get(symbolId: string): ResolvedSymbolVisualState | undefined {
    return this.#cache.get(symbolId);
  }

  public resolve(
    symbolId: string,
    sources: readonly RuntimeSymbolVisualInput[]
  ): ResolvedSymbolVisualState | undefined {
    const symbolType = this.#targets.get(symbolId);
    if (symbolType === undefined) {
      this.#diagnostic(
        "RUNTIME_VISUAL_TARGET_MISSING",
        "Runtime visual target does not exist.",
        symbolId
      );
      return undefined;
    }
    const definition = this.#symbols.get(symbolType);
    if (definition === undefined) {
      this.#diagnostic(
        "RUNTIME_VISUAL_TARGET_MISSING",
        "Runtime visual target references a missing symbol definition.",
        symbolId
      );
      return undefined;
    }
    const immutableSources = Object.freeze(sources.map(freezeInput));
    this.#sources.set(symbolId, immutableSources);
    this.#resolutionCount += 1;
    const capabilities = resolveSymbolVisualCapabilities(definition);
    const merged = mergeSources(immutableSources, this.#overrides.get(symbolId));
    const resolved = this.#normalize(symbolId, definition, capabilities, merged);
    if (resolved === undefined) return this.#cache.get(symbolId);
    const previous = this.#cache.get(symbolId);
    if (equalState(previous, resolved)) return previous;
    this.#revision += 1;
    const current = Object.freeze({ ...resolved, revision: this.#revision });
    this.#cache.set(symbolId, current);
    return current;
  }

  public resolveMany(
    updates: ReadonlyMap<string, readonly RuntimeSymbolVisualInput[]>
  ): ReadonlyMap<string, ResolvedSymbolVisualState> {
    const changed = new Map<string, ResolvedSymbolVisualState>();
    for (const [symbolId, sources] of updates) {
      const previous = this.#cache.get(symbolId);
      const current = this.resolve(symbolId, sources);
      if (current !== undefined && current !== previous) changed.set(symbolId, current);
    }
    return changed;
  }

  public setOverride(symbolId: string, override: RuntimeSymbolVisualInput): boolean {
    if (!this.#targets.has(symbolId)) {
      this.#diagnostic(
        "RUNTIME_VISUAL_TARGET_MISSING",
        "Cannot override a missing runtime visual target.",
        symbolId
      );
      return false;
    }
    if (
      override.priority !== undefined ||
      override.timestamp !== undefined ||
      override.sourceId !== undefined ||
      !validOverride(override)
    ) {
      this.#diagnostic(
        "RUNTIME_VISUAL_OVERRIDE_INVALID",
        "Runtime override contains invalid values or source ordering fields.",
        symbolId
      );
      return false;
    }
    const frozen = freezeInput(override);
    this.#overrides.set(symbolId, frozen);
    this.resolve(symbolId, this.#sources.get(symbolId) ?? []);
    return true;
  }

  public clearOverride(symbolId: string): boolean {
    if (!this.#overrides.delete(symbolId)) return false;
    this.resolve(symbolId, this.#sources.get(symbolId) ?? []);
    return true;
  }

  public invalidate(symbolIds: readonly string[]): void {
    for (const symbolId of symbolIds) this.#cache.delete(symbolId);
  }

  public clear(): void {
    this.#cache.clear();
    this.#sources.clear();
    this.#overrides.clear();
  }

  #normalize(
    symbolId: string,
    definition: SymbolDefinition,
    capabilities: SymbolVisualCapabilities,
    input: RuntimeSymbolVisualInput
  ): Omit<ResolvedSymbolVisualState, "revision"> | undefined {
    const flags: Record<(typeof FLAG_FIELDS)[number], boolean> = {
      active: false,
      running: false,
      open: false,
      enabled: true,
      disabled: false,
      offline: false,
      warning: false,
      alarm: false
    };
    for (const field of FLAG_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        this.#invalid(symbolId, field, "Runtime visual flag must be boolean.");
        continue;
      }
      const capability =
        `supports${field[0]?.toUpperCase() ?? ""}${field.slice(1)}` as keyof SymbolVisualCapabilities;
      if (!capabilities[capability]) {
        this.#unsupported(symbolId, field);
        continue;
      }
      flags[field] = value;
    }

    const numeric: Partial<Record<(typeof NUMBER_FIELDS)[number], number>> = {};
    for (const field of NUMBER_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        this.#invalid(symbolId, field, "Runtime visual numeric value must be finite.");
        continue;
      }
      const capability =
        `supports${field[0]?.toUpperCase() ?? ""}${field.slice(1)}` as keyof SymbolVisualCapabilities;
      if (!capabilities[capability]) {
        this.#unsupported(symbolId, field);
        continue;
      }
      numeric[field] = value;
    }

    let quality: DataQuality = "unknown";
    if (input.quality !== undefined) {
      if (typeof input.quality === "string" && QUALITIES.includes(input.quality as DataQuality))
        quality = input.quality as DataQuality;
      else this.#invalid(symbolId, "quality", "Unknown runtime quality.");
    }
    let requestedState: SymbolState | undefined;
    if (input.state !== undefined) {
      if (typeof input.state === "string" && STATES.includes(input.state as SymbolState))
        requestedState = input.state as SymbolState;
      else this.#invalid(symbolId, "state", "Unknown runtime visual state.");
    }
    if (
      requestedState !== undefined &&
      requestedState !== "normal" &&
      !definition.supportedStates.includes(requestedState)
    ) {
      this.#unsupported(symbolId, "state");
      requestedState = undefined;
    }
    if (quality === "offline" && capabilities.supportsOffline) flags.offline = true;
    if (requestedState !== undefined && requestedState !== "normal") {
      const field =
        requestedState === "inactive"
          ? "active"
          : requestedState === "stopped"
            ? "running"
            : requestedState;
      if (field in flags)
        flags[field as keyof typeof flags] = !["inactive", "stopped"].includes(requestedState);
    }
    if (!flags.enabled) flags.disabled = capabilities.supportsDisabled;

    const properties: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    for (const [key, value] of Object.entries(input.properties ?? {})) {
      const supported = definition.bindableProperties.some(
        ({ key: candidate }) => candidate === key
      );
      if (!supported) {
        this.#diagnostic(
          "RUNTIME_VISUAL_PROPERTY_UNKNOWN",
          "Unknown or non-bindable runtime visual property was ignored.",
          symbolId,
          key
        );
        continue;
      }
      if (!isJsonValue(value)) {
        this.#invalid(symbolId, key, "Runtime visual property must be JSON-safe.");
        continue;
      }
      properties[key] = freezeJson(value);
    }
    for (const [key, value] of Object.entries(numeric)) properties[key] = value;

    const direction =
      input.direction === undefined
        ? undefined
        : typeof input.direction === "string" &&
            DIRECTIONS.includes(input.direction as RuntimeVisualDirection) &&
            capabilities.supportsDirection
          ? (input.direction as RuntimeVisualDirection)
          : undefined;
    if (input.direction !== undefined && direction === undefined)
      if (!capabilities.supportsDirection) this.#unsupported(symbolId, "direction");
      else this.#invalid(symbolId, "direction", "Unknown runtime visual direction.");

    const text =
      typeof input.text === "string" && capabilities.supportsText ? input.text : undefined;
    if (input.text !== undefined && text === undefined)
      if (!capabilities.supportsText) this.#unsupported(symbolId, "text");
      else this.#invalid(symbolId, "text", "Runtime visual text must be a string.");
    if (text !== undefined) properties.text = text;

    const value =
      input.value !== undefined && isJsonValue(input.value) && capabilities.supportsValue
        ? freezeJson(input.value)
        : undefined;
    if (input.value !== undefined && value === undefined)
      if (!capabilities.supportsValue) this.#unsupported(symbolId, "value");
      else this.#invalid(symbolId, "value", "Runtime visual value must be JSON-safe.");
    if (value !== undefined) properties.value = value;

    let visible: boolean | undefined;
    if (input.visible !== undefined) {
      if (typeof input.visible === "boolean") visible = input.visible;
      else this.#invalid(symbolId, "visible", "Runtime visual visibility must be boolean.");
    }

    const effectiveState = this.#effectiveState(flags, requestedState, input);
    const overrides = Object.freeze({ ...(this.#overrides.get(symbolId) ?? {}) });
    return {
      symbolId,
      effectiveState,
      state: effectiveState,
      properties: Object.freeze(properties),
      quality,
      ...flags,
      ...(numeric.level === undefined ? {} : { level: numeric.level }),
      ...(numeric.speed === undefined ? {} : { speed: numeric.speed }),
      ...(numeric.flow === undefined ? {} : { flow: numeric.flow }),
      ...(direction === undefined ? {} : { direction }),
      ...(text === undefined ? {} : { text }),
      ...(value === undefined ? {} : { value }),
      ...(visible === undefined ? {} : { visible }),
      overrides
    };
  }

  #effectiveState(
    flags: Readonly<Record<(typeof FLAG_FIELDS)[number], boolean>>,
    requestedState: SymbolState | undefined,
    input: RuntimeSymbolVisualInput
  ): SymbolState {
    if (flags.disabled) return "disabled";
    if (flags.offline) return "offline";
    if (flags.alarm) return "alarm";
    if (flags.warning) return "warning";
    if (flags.running) return "running";
    if (flags.active || flags.open) return "active";
    if (requestedState === "stopped" || input.running === false) return "stopped";
    if (requestedState === "inactive" || input.active === false || input.open === false)
      return "inactive";
    return requestedState ?? "normal";
  }

  #unsupported(symbolId: string, property: string): void {
    this.#diagnostic(
      "RUNTIME_VISUAL_CAPABILITY_UNSUPPORTED",
      "Runtime visual capability is not supported by this symbol.",
      symbolId,
      property
    );
  }

  #invalid(symbolId: string, property: string, message: string): void {
    this.#diagnostic("RUNTIME_VISUAL_VALUE_INVALID", message, symbolId, property);
  }

  #diagnostic(
    code: RuntimeDiagnosticCode,
    message: string,
    symbolId: string,
    property?: string
  ): void {
    if (property === undefined) this.#onDiagnostic?.(code, message, symbolId);
    else this.#onDiagnostic?.(code, message, symbolId, property);
  }
}
