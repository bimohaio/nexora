import type { JsonValue } from "@web-scada/core";
import { DataSourceError } from "@web-scada/datasource-core";

export type SimulatorGeneratorDefinition =
  | { readonly type: "constant"; readonly value: JsonValue }
  | { readonly type: "sequence"; readonly values: readonly JsonValue[]; readonly loop?: boolean }
  | { readonly type: "toggle" }
  | {
      readonly type: "counter";
      readonly step?: number;
      readonly minimum?: number;
      readonly maximum?: number;
      readonly overflow?: "wrap" | "clamp";
    }
  | {
      readonly type: "sine";
      readonly minimum: number;
      readonly maximum: number;
      readonly periodMs: number;
      readonly phase?: number;
      readonly precision?: number;
    }
  | {
      readonly type: "random-range";
      readonly minimum: number;
      readonly maximum: number;
      readonly integer?: boolean;
    }
  | {
      readonly type: "random-walk";
      readonly minimum: number;
      readonly maximum: number;
      readonly maximumStep: number;
      readonly boundary?: "clamp" | "reflect";
    }
  | { readonly type: "manual" };

export interface GeneratorTick {
  readonly now: number;
  readonly elapsedMs: number;
  readonly tick: number;
  readonly random: () => number;
}

export function createSeededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed))
    throw configurationError("Simulator seeds must be safe integers.");
  return seed | 0;
}

export function nextGeneratedValue(
  definition: Readonly<SimulatorGeneratorDefinition>,
  previous: JsonValue,
  context: Readonly<GeneratorTick>
): JsonValue {
  switch (definition.type) {
    case "constant":
      return definition.value;
    case "manual":
      return previous;
    case "toggle":
      return !previous;
    case "sequence": {
      const index = definition.values.findIndex((entry) => jsonEqual(entry, previous));
      const next = index < 0 ? 0 : index + 1;
      return definition.values[
        next < definition.values.length ? next : definition.loop === false ? index : 0
      ] as JsonValue;
    }
    case "counter": {
      const step = definition.step ?? 1;
      let value = number(previous) + step;
      if (definition.maximum !== undefined && value > definition.maximum)
        value = definition.overflow === "clamp" ? definition.maximum : (definition.minimum ?? 0);
      if (definition.minimum !== undefined && value < definition.minimum)
        value =
          definition.overflow === "clamp"
            ? definition.minimum
            : (definition.maximum ?? definition.minimum);
      return finite(value);
    }
    case "sine": {
      const midpoint = (definition.minimum + definition.maximum) / 2;
      const amplitude = (definition.maximum - definition.minimum) / 2;
      let value =
        midpoint +
        amplitude *
          Math.sin(
            (2 * Math.PI * context.elapsedMs) / definition.periodMs + (definition.phase ?? 0)
          );
      if (definition.precision !== undefined) {
        const factor = 10 ** definition.precision;
        value = Math.round(value * factor) / factor;
      }
      return finite(Math.max(definition.minimum, Math.min(definition.maximum, value)));
    }
    case "random-range": {
      const value =
        definition.minimum + context.random() * (definition.maximum - definition.minimum);
      return finite(definition.integer ? Math.floor(value) : value);
    }
    case "random-walk": {
      let value = number(previous) + (context.random() * 2 - 1) * definition.maximumStep;
      if (definition.boundary === "reflect") {
        if (value > definition.maximum) value = definition.maximum - (value - definition.maximum);
        if (value < definition.minimum) value = definition.minimum + (definition.minimum - value);
      }
      return finite(Math.max(definition.minimum, Math.min(definition.maximum, value)));
    }
  }
}

function number(value: JsonValue): number {
  if (typeof value !== "number")
    throw configurationError("Numeric generator received a non-number.");
  return value;
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw configurationError("Generator produced a non-finite number.");
  return Object.is(value, -0) ? 0 : value;
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function configurationError(message: string): DataSourceError {
  return new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}
