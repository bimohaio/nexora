import type { JsonValue } from "@web-scada/core";
import {
  DataSourceError,
  dataPointAddressKey,
  normalizeAddress,
  normalizeDataQuality,
  validateDataSourceIdentity
} from "@web-scada/datasource-core";
import type { SimulatorDataSourceConfig, SimulatorPointDefinition } from "./contracts.js";
import { normalizeSeed } from "./generators.js";

export function validateSimulatorConfig(config: Readonly<SimulatorDataSourceConfig>): void {
  validateDataSourceIdentity(config.identity);
  if (config.points.length === 0) invalid("Simulator requires at least one point.");
  if (config.seed !== undefined) normalizeSeed(config.seed);
  if (
    config.connectionFailures !== undefined &&
    (!Number.isSafeInteger(config.connectionFailures) || config.connectionFailures < 0)
  )
    invalid("connectionFailures must be a non-negative safe integer.");
  interval(config.connectionDelayMs, "connectionDelayMs", true);
  const addresses = new Set<string>();
  for (const point of config.points) {
    validatePoint(point, config.identity.id);
    const key = dataPointAddressKey(point.address);
    if (addresses.has(key)) invalid(`Duplicate simulator point '${key}'.`);
    addresses.add(key);
  }
}

function validatePoint(point: Readonly<SimulatorPointDefinition>, sourceId: string): void {
  normalizeAddress(point.address);
  if (point.address.sourceId !== sourceId)
    invalid("Point sourceId must match simulator identity.id.");
  if (!matchesType(point.initialValue, point.dataType))
    invalid(`Initial value for '${point.address.key}' does not match dataType.`);
  const quality = normalizeDataQuality(point.quality ?? { level: "GOOD", reason: "GOOD" });
  if (quality.level === "UNKNOWN" && point.quality?.level !== "UNKNOWN")
    invalid("Point quality is invalid.");
  interval(point.updateIntervalMs, "updateIntervalMs");
  if (point.seed !== undefined) normalizeSeed(point.seed);
  finiteOptional(point.minimum, "minimum");
  finiteOptional(point.maximum, "maximum");
  if (point.minimum !== undefined && point.maximum !== undefined && point.minimum > point.maximum)
    invalid("minimum must not exceed maximum.");
  const generator = point.generator;
  if (generator.type === "sequence" && generator.values.length === 0)
    invalid("Sequence generator values must not be empty.");
  if (
    generator.type === "sequence" &&
    generator.values.some((value) => !matchesType(value, point.dataType))
  )
    invalid("Sequence values must match point dataType.");
  if (
    ["counter", "sine", "random-range", "random-walk"].includes(generator.type) &&
    point.dataType !== "number"
  )
    invalid(`${generator.type} generator requires a number point.`);
  if (generator.type === "toggle" && point.dataType !== "boolean")
    invalid("Toggle generator requires a boolean point.");
  if (generator.type === "constant" && !matchesType(generator.value, point.dataType))
    invalid("Constant value must match point dataType.");
  if (generator.type === "sine") {
    bounds(generator.minimum, generator.maximum);
    interval(generator.periodMs, "periodMs");
    if (
      generator.precision !== undefined &&
      (!Number.isSafeInteger(generator.precision) ||
        generator.precision < 0 ||
        generator.precision > 15)
    )
      invalid("precision must be an integer between 0 and 15.");
  }
  if (generator.type === "random-range") bounds(generator.minimum, generator.maximum);
  if (generator.type === "random-walk") {
    bounds(generator.minimum, generator.maximum);
    if (!Number.isFinite(generator.maximumStep) || generator.maximumStep < 0)
      invalid("maximumStep must be finite and non-negative.");
  }
  if (
    generator.type === "counter" &&
    generator.step !== undefined &&
    !Number.isFinite(generator.step)
  )
    invalid("Counter step must be finite.");
}

export function matchesType(value: JsonValue, type: string): boolean {
  return typeof value === type && (typeof value !== "number" || Number.isFinite(value));
}

function bounds(minimum: number, maximum: number): void {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum)
    invalid("Generator bounds must be finite and ordered.");
}
function finiteOptional(value: number | undefined, name: string): void {
  if (value !== undefined && !Number.isFinite(value)) invalid(`${name} must be finite.`);
}
function interval(value: number | undefined, name: string, allowZero = false): void {
  if (value !== undefined && (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)))
    invalid(`${name} must be a finite ${allowZero ? "non-negative" : "positive"} number.`);
}
function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}
