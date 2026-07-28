import {
  DataSourceError,
  dataPointAddressKey,
  normalizeAddress,
  normalizeMetadata,
  validateDataSourceIdentity
} from "@web-scada/datasource-core";
import type {
  JsonExpectedType,
  JsonPath,
  RestDataSourceConfig,
  RestEndpointConfig,
  RestPointMapping
} from "./contracts.js";

const FORBIDDEN_HEADERS = new Set(["authorization", "cookie", "proxy-authorization", "x-api-key"]);
const TYPES = new Set<JsonExpectedType>(["null", "boolean", "number", "string", "array", "object"]);

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}

export function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid endpoint]";
  }
}

export function validateEndpoint(
  endpoint: Readonly<RestEndpointConfig>,
  allowedHosts?: readonly string[]
): void {
  let url: URL;
  try {
    url = new URL(endpoint.url);
  } catch {
    invalid("REST endpoint URL is malformed.");
  }
  if (url.username || url.password) invalid("REST endpoint must not contain embedded credentials.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && endpoint.allowInsecure === true))
    invalid("REST endpoint must use HTTPS unless insecure HTTP is explicitly allowed.");
  if (allowedHosts !== undefined && !allowedHosts.includes(url.hostname))
    invalid("REST endpoint host is not allowed.");
  if (endpoint.method !== undefined && !["GET", "POST", "PUT", "PATCH"].includes(endpoint.method))
    invalid("REST endpoint method is unsupported.");
  if (
    endpoint.timeoutMs !== undefined &&
    (!Number.isFinite(endpoint.timeoutMs) || endpoint.timeoutMs <= 0)
  )
    invalid("REST endpoint timeout must be positive and finite.");
  for (const [name, value] of Object.entries(endpoint.headers ?? {})) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) || /[\r\n]/.test(value))
      invalid("REST static header is malformed.");
    if (FORBIDDEN_HEADERS.has(name.toLowerCase()))
      invalid("Secret-bearing REST headers must be supplied by the authentication provider.");
  }
}

export function validateJsonPath(path: JsonPath, name: string): void {
  if (!Array.isArray(path) || path.length > 32)
    invalid(`${name} must contain at most 32 segments.`);
  for (const segment of path)
    if (
      (typeof segment !== "string" && typeof segment !== "number") ||
      (typeof segment === "string" &&
        (segment === "" || ["__proto__", "prototype", "constructor"].includes(segment))) ||
      (typeof segment === "number" && (!Number.isSafeInteger(segment) || segment < 0))
    )
      invalid(`${name} contains an unsafe segment.`);
}

export function validateRestConfig(config: Readonly<RestDataSourceConfig>): void {
  validateDataSourceIdentity(config.identity);
  if (config.identity.type !== "rest") invalid("REST adapter identity type must be 'rest'.");
  validateEndpoint(config.endpoint, config.allowedHosts);
  if (!Array.isArray(config.response.points) || config.response.points.length === 0)
    invalid("REST response must map at least one point.");
  const addresses = new Set<string>();
  for (const [index, point] of (config.response.points as readonly RestPointMapping[]).entries()) {
    const address = normalizeAddress(point.address);
    if (address.sourceId !== config.identity.id)
      invalid("REST point sourceId must match adapter ID.");
    const key = dataPointAddressKey(address);
    if (addresses.has(key)) invalid("REST point mappings must have unique addresses.");
    addresses.add(key);
    validateJsonPath(point.path, `response.points[${index}].path`);
    if (point.qualityPath) validateJsonPath(point.qualityPath, "qualityPath");
    if (point.timestampPath) validateJsonPath(point.timestampPath, "timestampPath");
    if (point.sequencePath) validateJsonPath(point.sequencePath, "sequencePath");
    if (point.expectedType !== undefined && !TYPES.has(point.expectedType))
      invalid("REST point expectedType is unsupported.");
    normalizeMetadata(point.metadata);
  }
  if (config.response.timestampPath)
    validateJsonPath(config.response.timestampPath, "timestampPath");
  if (
    config.polling !== undefined &&
    (!Number.isFinite(config.polling.intervalMs) || config.polling.intervalMs <= 0)
  )
    invalid("REST polling interval must be positive and finite.");
  if (config.write) validateEndpoint(config.write.endpoint, config.allowedHosts);
  for (const [name, value] of Object.entries({
    responseBytes: config.limits?.responseBytes ?? 1_048_576,
    requestBytes: config.limits?.requestBytes ?? 262_144,
    jsonDepth: config.limits?.jsonDepth ?? 32,
    maxRetryAfterMs: config.limits?.maxRetryAfterMs ?? 60_000
  }))
    if (!Number.isSafeInteger(value) || value <= 0) invalid(`REST ${name} limit must be positive.`);
}

export function extractPath(root: unknown, path: JsonPath): unknown {
  let value = root;
  for (const segment of path) {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}
