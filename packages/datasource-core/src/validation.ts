import type {
  DataPointAddress,
  DataSourceCapabilities,
  DataSourceIdentity,
  DataSourceOperation,
  DataSourcePermission,
  DataSourcePermissions,
  ReadRequest,
  SubscriptionRequest,
  WriteRequest
} from "./contracts.js";
import { accessDenied, DataSourceError, unsupportedOperation } from "./errors.js";
import {
  dataPointAddressKey,
  normalizeAddress,
  normalizeJsonValue,
  normalizeMetadata,
  normalizeTimestamp
} from "./normalization.js";

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}

function nonEmpty(value: unknown, name: string): void {
  if (typeof value !== "string" || value.trim() === "") invalid(`${name} must be non-empty.`);
}

function optionalDuration(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    invalid(`${name} must be a finite non-negative number.`);
  }
}

function validateAddresses(addresses: readonly DataPointAddress[], name: string): void {
  const candidate: unknown = addresses;
  if (!Array.isArray(candidate) || candidate.length === 0) invalid(`${name} must not be empty.`);
  const keys = new Set<string>();
  for (const address of candidate as readonly unknown[]) {
    const normalized = normalizeAddress(address);
    const key = dataPointAddressKey(normalized);
    if (keys.has(key)) invalid(`${name} contains a duplicate address.`);
    keys.add(key);
  }
}

export function validateDataSourceIdentity(identity: Readonly<DataSourceIdentity>): void {
  nonEmpty(identity.id, "identity.id");
  nonEmpty(identity.type, "identity.type");
  normalizeMetadata(identity.metadata);
}

export function validateSubscriptionRequest(request: Readonly<SubscriptionRequest>): void {
  validateAddresses(request.addresses, "addresses");
  optionalDuration(request.samplingIntervalMs, "samplingIntervalMs");
  optionalDuration(request.publishIntervalMs, "publishIntervalMs");
  if (
    request.queueSize !== undefined &&
    (!Number.isSafeInteger(request.queueSize) || request.queueSize <= 0)
  ) {
    invalid("queueSize must be a positive safe integer.");
  }
  if (request.deadband) {
    if (
      !["absolute", "percent"].includes(request.deadband.type) ||
      !Number.isFinite(request.deadband.value) ||
      request.deadband.value < 0 ||
      (request.deadband.type === "percent" && request.deadband.value > 100)
    ) {
      invalid("deadband is malformed.");
    }
  }
  normalizeMetadata(request.metadata);
}

export function validateReadRequest(request: Readonly<ReadRequest>): void {
  validateAddresses(request.addresses, "addresses");
  optionalDuration(request.timeoutMs, "timeoutMs");
  normalizeMetadata(request.metadata);
}

export function validateWriteRequest(request: Readonly<WriteRequest>): void {
  const candidate: unknown = request.items;
  if (!Array.isArray(candidate) || candidate.length === 0) invalid("items must not be empty.");
  optionalDuration(request.timeoutMs, "timeoutMs");
  normalizeMetadata(request.metadata);
  for (const item of request.items) {
    normalizeAddress(item.address);
    normalizeJsonValue(item.value);
    normalizeMetadata(item.metadata);
    if (item.sourceTimestamp !== undefined) normalizeTimestamp(item.sourceTimestamp);
  }
}

const PERMISSION_FOR_OPERATION: Partial<Record<DataSourceOperation, DataSourcePermission>> = {
  subscribe: "SUBSCRIBE",
  read: "READ",
  write: "WRITE",
  browse: "BROWSE",
  historyRead: "HISTORY_READ"
};

export function assertOperationAllowed(
  operation: DataSourceOperation,
  capabilities: DataSourceCapabilities,
  permissions: DataSourcePermissions
): void {
  if (!capabilities[operation]) throw unsupportedOperation(operation);
  const permission = PERMISSION_FOR_OPERATION[operation];
  if (permission && !permissions[permission]) throw accessDenied(operation);
}
