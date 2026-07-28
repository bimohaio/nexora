import {
  DataSourceError,
  normalizeMetadata,
  validateDataSourceIdentity
} from "@web-scada/datasource-core";
import type {
  WebSocketDataSourceConfig,
  WebSocketEndpointConfig,
  WebSocketJsonPath
} from "./contracts.js";

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}

export function safeWebSocketEndpoint(input: string): string {
  try {
    const url = new URL(input);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid endpoint]";
  }
}

export function validateWebSocketPath(path: WebSocketJsonPath, name: string): void {
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

function validateEndpoint(
  endpoint: Readonly<WebSocketEndpointConfig>,
  allowedHosts?: readonly string[]
): void {
  let url: URL;
  try {
    url = new URL(endpoint.url);
  } catch {
    invalid("WebSocket endpoint URL is malformed.");
  }
  if (url.username || url.password)
    invalid("WebSocket endpoint must not contain embedded credentials.");
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && endpoint.allowInsecure === true))
    invalid("WebSocket endpoint must use WSS unless insecure WS is explicitly allowed.");
  if (allowedHosts && !allowedHosts.includes(url.hostname))
    invalid("WebSocket endpoint host is not allowed.");
  if (
    endpoint.connectTimeoutMs !== undefined &&
    (!Number.isFinite(endpoint.connectTimeoutMs) || endpoint.connectTimeoutMs <= 0)
  )
    invalid("WebSocket connect timeout must be positive and finite.");
  for (const protocol of endpoint.protocols ?? [])
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(protocol))
      invalid("WebSocket subprotocol is malformed.");
}

export function validateWebSocketConfig(config: Readonly<WebSocketDataSourceConfig>): void {
  validateDataSourceIdentity(config.identity);
  if (config.identity.type !== "websocket")
    invalid("WebSocket adapter identity type must be 'websocket'.");
  validateEndpoint(config.endpoint, config.allowedHosts);
  for (const [name, path] of Object.entries(config.mapping))
    if (name.endsWith("Path") && path !== undefined)
      validateWebSocketPath(path as WebSocketJsonPath, `mapping.${name}`);
  if (
    config.mapping.discriminatorPath !== undefined &&
    config.mapping.discriminatorValue === undefined
  )
    invalid("WebSocket discriminatorValue is required with discriminatorPath.");
  if (config.heartbeat) {
    if (
      !Number.isFinite(config.heartbeat.intervalMs) ||
      config.heartbeat.intervalMs <= 0 ||
      !Number.isFinite(config.heartbeat.timeoutMs) ||
      config.heartbeat.timeoutMs <= 0 ||
      config.heartbeat.timeoutMs > config.heartbeat.intervalMs
    )
      invalid("WebSocket heartbeat timing is invalid.");
    if (config.heartbeat.responsePath)
      validateWebSocketPath(config.heartbeat.responsePath, "heartbeat.responsePath");
  }
  for (const [name, value] of Object.entries({
    messageBytes: config.limits?.messageBytes ?? 1_048_576,
    batchItems: config.limits?.batchItems ?? 1_000,
    inboundQueue: config.limits?.inboundQueue ?? 100
  }))
    if (!Number.isSafeInteger(value) || value <= 0)
      invalid(`WebSocket ${name} limit must be positive.`);
  normalizeMetadata(config.metadata);
}

export function extractWebSocketPath(root: unknown, path: WebSocketJsonPath): unknown {
  let value = root;
  for (const segment of path) {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}
