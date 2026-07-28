import type { JsonValue } from "@web-scada/core";
import {
  DATA_QUALITY_LEVELS,
  DATA_QUALITY_REASONS,
  type DataPointAddress,
  type DataPointValue,
  type DataQuality,
  type DataSourceDiagnostic,
  type DataSourceMetadata
} from "./contracts.js";
import { DataSourceError } from "./errors.js";

export interface JsonNormalizationLimits {
  readonly maxDepth: number;
  readonly maxArrayLength: number;
  readonly maxObjectKeys: number;
  readonly maxStringLength: number;
}
export const DEFAULT_JSON_NORMALIZATION_LIMITS: JsonNormalizationLimits = Object.freeze({
  maxDepth: 32,
  maxArrayLength: 10_000,
  maxObjectKeys: 10_000,
  maxStringLength: 1_000_000
});

function normalizationError(message: string): never {
  throw new DataSourceError("DATASOURCE_NORMALIZATION_ERROR", message);
}

function normalizeJsonInternal(
  input: unknown,
  limits: JsonNormalizationLimits,
  depth: number,
  ancestors: ReadonlySet<object>
): JsonValue {
  if (input === null || typeof input === "boolean") return input;
  if (typeof input === "string") {
    if (input.length > limits.maxStringLength)
      normalizationError("String exceeds normalization limit.");
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) normalizationError("Only finite numbers are supported.");
    return input;
  }
  if (typeof input !== "object") normalizationError("Value is not JSON-safe.");
  if (depth >= limits.maxDepth) normalizationError("Value exceeds maximum nesting depth.");
  if (ancestors.has(input)) normalizationError("Cyclic values are not supported.");

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(input);
  if (Array.isArray(input)) {
    if (input.length > limits.maxArrayLength)
      normalizationError("Array exceeds normalization limit.");
    return Object.freeze(
      input.map((value) => normalizeJsonInternal(value, limits, depth + 1, nextAncestors))
    );
  }
  const prototype = Object.getPrototypeOf(input) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    normalizationError("Only plain JSON objects are supported.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors);
  if (keys.length > limits.maxObjectKeys) normalizationError("Object exceeds normalization limit.");
  const output: Record<string, JsonValue> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) {
      normalizationError("Accessor properties are not supported.");
    }
    const descriptorValue = (descriptor as { readonly value: unknown }).value;
    output[key] = normalizeJsonInternal(descriptorValue, limits, depth + 1, nextAncestors);
  }
  return Object.freeze(output);
}

/** Validates and copies an untrusted value without invoking getters or mutating the input. */
export function normalizeJsonValue(
  input: unknown,
  limits: JsonNormalizationLimits = DEFAULT_JSON_NORMALIZATION_LIMITS
): JsonValue {
  return normalizeJsonInternal(input, limits, 0, new Set());
}

export function normalizeMetadata(
  input: unknown,
  limits: JsonNormalizationLimits = DEFAULT_JSON_NORMALIZATION_LIMITS
): DataSourceMetadata | undefined {
  if (input === undefined) return undefined;
  const normalized = normalizeJsonValue(input, limits);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    normalizationError("Metadata must be a plain JSON object.");
  }
  return normalized as DataSourceMetadata;
}

export function normalizeTimestamp(input: unknown, fieldName = "timestamp"): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    normalizationError(`${fieldName} must be a non-negative Unix epoch millisecond number.`);
  }
  return input;
}

export function normalizeDataQuality(input: unknown): DataQuality {
  if (input === undefined || input === null) {
    return Object.freeze({ level: "UNKNOWN", reason: "UNKNOWN" });
  }
  if (typeof input === "boolean") {
    return Object.freeze(
      input ? { level: "GOOD", reason: "GOOD" } : { level: "BAD", reason: "UNKNOWN" }
    );
  }
  if (typeof input === "string") {
    const level = input.toUpperCase();
    if ((DATA_QUALITY_LEVELS as readonly string[]).includes(level)) {
      return Object.freeze({ level: level as DataQuality["level"] });
    }
    return Object.freeze({ level: "UNKNOWN", reason: "UNKNOWN", code: input.slice(0, 128) });
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return Object.freeze({ level: "UNKNOWN", reason: "UNKNOWN" });
  }
  const quality = input as Record<string, unknown>;
  const level =
    typeof quality.level === "string" &&
    (DATA_QUALITY_LEVELS as readonly string[]).includes(quality.level)
      ? (quality.level as DataQuality["level"])
      : "UNKNOWN";
  const reason =
    typeof quality.reason === "string" &&
    (DATA_QUALITY_REASONS as readonly string[]).includes(quality.reason)
      ? (quality.reason as DataQuality["reason"])
      : level === "UNKNOWN"
        ? "UNKNOWN"
        : undefined;
  return Object.freeze({
    level,
    ...(reason === undefined ? {} : { reason }),
    ...(typeof quality.code === "string" ? { code: quality.code.slice(0, 128) } : {}),
    ...(typeof quality.message === "string" ? { message: quality.message.slice(0, 512) } : {})
  });
}

export interface RawDataPointValue {
  readonly address: DataPointAddress;
  readonly value: unknown;
  readonly quality?: unknown;
  readonly sourceTimestamp?: unknown;
  readonly sequence?: unknown;
  readonly metadata?: unknown;
}

export interface NormalizeDataPointOptions {
  readonly receivedTimestamp: number;
  readonly limits?: JsonNormalizationLimits;
}

export function normalizeDataPointValue(
  input: Readonly<RawDataPointValue>,
  options: Readonly<NormalizeDataPointOptions>
): DataPointValue {
  const receivedTimestamp = normalizeTimestamp(options.receivedTimestamp, "receivedTimestamp");
  const diagnostics: DataSourceDiagnostic[] = [];
  const sourceTimestamp =
    input.sourceTimestamp === undefined
      ? undefined
      : normalizeTimestamp(input.sourceTimestamp, "sourceTimestamp");
  if (sourceTimestamp === undefined) {
    diagnostics.push(
      Object.freeze({
        code: "DATASOURCE_TIMESTAMP_FALLBACK",
        severity: "info",
        message: "Source timestamp was not provided; received timestamp remains authoritative.",
        timestamp: receivedTimestamp
      })
    );
  }
  if (
    input.sequence !== undefined &&
    (typeof input.sequence !== "number" ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 0)
  ) {
    normalizationError("sequence must be a non-negative safe integer.");
  }
  const quality = normalizeDataQuality(input.quality);
  if (quality.level === "UNKNOWN") {
    diagnostics.push(
      Object.freeze({
        code: "DATASOURCE_QUALITY_UNKNOWN",
        severity: "warning",
        message: "Quality was missing or unrecognized and was normalized to UNKNOWN.",
        timestamp: receivedTimestamp
      })
    );
  }
  const metadata = normalizeMetadata(input.metadata, options.limits);
  return Object.freeze({
    address: normalizeAddress(input.address),
    value: normalizeJsonValue(input.value, options.limits),
    quality,
    ...(sourceTimestamp === undefined ? {} : { sourceTimestamp }),
    receivedTimestamp,
    ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
    ...(metadata === undefined ? {} : { metadata }),
    diagnostics: Object.freeze(diagnostics)
  });
}

export function normalizeAddress(input: unknown): DataPointAddress {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    normalizationError("Address is required.");
  }
  const address = input as Record<string, unknown>;
  if (typeof address.sourceId !== "string" || address.sourceId.trim() === "") {
    normalizationError("Address sourceId must be non-empty.");
  }
  if (typeof address.key !== "string" || address.key.trim() === "") {
    normalizationError("Address key must be non-empty.");
  }
  if (
    address.path !== undefined &&
    (!Array.isArray(address.path) ||
      address.path.some((part) => typeof part !== "string" || part.length === 0))
  ) {
    normalizationError("Address path segments must be non-empty strings.");
  }
  if (address.namespace !== undefined && typeof address.namespace !== "string") {
    normalizationError("Address namespace must be a string.");
  }
  const extensions = normalizeMetadata(address.extensions);
  return Object.freeze({
    sourceId: address.sourceId,
    key: address.key,
    ...(address.namespace === undefined ? {} : { namespace: address.namespace }),
    ...(address.path === undefined
      ? {}
      : { path: Object.freeze([...(address.path as readonly string[])]) }),
    ...(extensions === undefined ? {} : { extensions })
  });
}

/** Length-prefixed fields avoid delimiter ambiguity and provide stable equality keys. */
export function dataPointAddressKey(address: Readonly<DataPointAddress>): string {
  const normalized = normalizeAddress(address);
  const fields = [
    normalized.sourceId,
    normalized.namespace ?? "",
    normalized.key,
    ...(normalized.path ?? [])
  ];
  return fields.map((field) => `${field.length}:${field}`).join("|");
}

export function dataPointAddressesEqual(
  left: Readonly<DataPointAddress>,
  right: Readonly<DataPointAddress>
): boolean {
  return dataPointAddressKey(left) === dataPointAddressKey(right);
}
