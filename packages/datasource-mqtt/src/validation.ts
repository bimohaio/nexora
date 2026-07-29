import {
  DataSourceError,
  dataPointAddressKey,
  normalizeAddress,
  normalizeMetadata,
  validateDataSourceIdentity
} from "@web-scada/datasource-core";
import type {
  MqttDataSourceConfig,
  MqttJsonPath,
  MqttMessageMapping,
  MqttQos,
  MqttSubscriptionDefinition
} from "./contracts.js";
import { validateMqttTopicFilter, validateMqttTopicName } from "./topic.js";

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}

export function safeMqttEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid MQTT endpoint]";
  }
}

function validatePath(path: MqttJsonPath | undefined, name: string): void {
  if (!path) return;
  if (path.length > 32) invalid(`${name} must contain at most 32 segments.`);
  for (const segment of path)
    if (
      (typeof segment !== "string" && typeof segment !== "number") ||
      (typeof segment === "string" &&
        (segment === "" || ["__proto__", "prototype", "constructor"].includes(segment))) ||
      (typeof segment === "number" && (!Number.isSafeInteger(segment) || segment < 0))
    )
      invalid(`${name} contains an unsafe segment.`);
}

function validateQos(qos: unknown, name: string): asserts qos is MqttQos | undefined {
  if (qos !== undefined && qos !== 0 && qos !== 1 && qos !== 2)
    invalid(`${name} must be MQTT QoS 0, 1, or 2.`);
}

function validateMapping(mapping: Readonly<MqttMessageMapping>, sourceId: string): void {
  if (
    !mapping.address &&
    !(mapping.topicTemplate && mapping.addressKeyTemplate) &&
    !mapping.pointKeyPath
  )
    invalid("MQTT mapping must define a static address, a topic template, or pointKeyPath.");
  if (mapping.address && normalizeAddress(mapping.address).sourceId !== sourceId)
    invalid("MQTT mapped address sourceId must match adapter ID.");
  if ((mapping.topicTemplate === undefined) !== (mapping.addressKeyTemplate === undefined))
    invalid("MQTT topicTemplate and addressKeyTemplate must be configured together.");
  if (mapping.topicTemplate && mapping.addressKeyTemplate)
    compileMqttTopicTemplate(mapping.topicTemplate, mapping.addressKeyTemplate);
  for (const [name, path] of Object.entries({
    batchPath: mapping.batchPath,
    pointKeyPath: mapping.pointKeyPath,
    valuePath: mapping.valuePath,
    qualityPath: mapping.qualityPath,
    timestampPath: mapping.timestampPath,
    sequencePath: mapping.sequencePath
  }))
    validatePath(path, name);
  if (mapping.decoder.type === "boolean") {
    const trueToken = mapping.decoder.trueToken ?? "true";
    const falseToken = mapping.decoder.falseToken ?? "false";
    if (trueToken === falseToken || trueToken === "" || falseToken === "")
      invalid("MQTT boolean decoder tokens must be non-empty and distinct.");
  }
}

export function validateMqttConfig(config: Readonly<MqttDataSourceConfig>): void {
  validateDataSourceIdentity(config.identity);
  if (config.identity.type !== "mqtt") invalid("MQTT adapter identity type must be 'mqtt'.");
  let url: URL;
  try {
    url = new URL(config.connection.url);
  } catch {
    invalid("MQTT broker URL is malformed.");
  }
  if (url.username || url.password)
    invalid("MQTT broker URL must not contain embedded credentials.");
  const secure = url.protocol === "mqtts:" || url.protocol === "wss:";
  const insecure = url.protocol === "mqtt:" || url.protocol === "ws:";
  if (!secure && !(insecure && config.connection.allowInsecure === true))
    invalid("MQTT broker must use mqtts or wss unless insecure transport is explicitly allowed.");
  if (config.allowedHosts && !config.allowedHosts.includes(url.hostname))
    invalid("MQTT broker host is not allowed.");
  if (
    (config.connection.protocolVersion as number) !== 4 &&
    (config.connection.protocolVersion as number) !== 5
  )
    invalid("MQTT protocolVersion must be 4 (3.1.1) or 5 (5.0).");
  if (config.connection.clientId.trim() === "" || config.connection.clientId.length > 128)
    invalid("MQTT clientId must contain 1 to 128 characters.");
  if (!config.connection.cleanStart && config.connection.clientId.trim() === "")
    invalid("Persistent MQTT sessions require a stable clientId.");
  if (
    config.connection.protocolVersion === 4 &&
    config.connection.sessionExpiryIntervalSeconds !== undefined
  )
    invalid("MQTT session expiry is supported only by protocol version 5.");
  for (const [name, value] of Object.entries({
    keepAliveSeconds: config.connection.keepAliveSeconds ?? 60,
    connectTimeoutMs: config.connection.connectTimeoutMs ?? 10_000,
    payloadBytes: config.limits?.payloadBytes ?? 1_048_576,
    inboundQueue: config.limits?.inboundQueue ?? 1_000,
    batchItems: config.limits?.batchItems ?? 1_000,
    maxInflightPublishes: config.limits?.maxInflightPublishes ?? 32,
    publishTimeoutMs: config.limits?.publishTimeoutMs ?? 10_000
  }))
    if (!Number.isSafeInteger(value) || value <= 0) invalid(`MQTT ${name} must be positive.`);
  if (
    config.connection.sessionExpiryIntervalSeconds !== undefined &&
    (!Number.isSafeInteger(config.connection.sessionExpiryIntervalSeconds) ||
      config.connection.sessionExpiryIntervalSeconds < 0)
  )
    invalid("MQTT session expiry must be a non-negative integer.");
  if (config.connection.will) {
    validateMqttTopicName(config.connection.will.topic);
    validateQos(config.connection.will.qos, "MQTT will QoS");
    if (
      config.connection.will.delayIntervalSeconds !== undefined &&
      config.connection.protocolVersion !== 5
    )
      invalid("MQTT will delay is supported only by protocol version 5.");
  }
  if (!Array.isArray(config.subscriptions)) invalid("MQTT subscriptions must be an array.");
  const subscriptionIds = new Set<string>();
  const definitions: readonly MqttSubscriptionDefinition[] = config.subscriptions;
  for (const definition of definitions) {
    validateMqttTopicFilter(definition.topicFilter);
    validateQos(definition.qos, "MQTT subscription QoS");
    if (
      config.connection.protocolVersion === 4 &&
      (definition.noLocal !== undefined ||
        definition.retainAsPublished !== undefined ||
        definition.retainHandling !== undefined)
    )
      invalid("MQTT 5 subscription options require protocol version 5.");
    if (definition.retainHandling !== undefined && ![0, 1, 2].includes(definition.retainHandling))
      invalid("MQTT retainHandling must be 0, 1, or 2.");
    validateMapping(definition.mapping, config.identity.id);
    normalizeMetadata(definition.metadata);
    const id = definition.id ?? `${definition.topicFilter}:${JSON.stringify(definition.mapping)}`;
    if (subscriptionIds.has(id)) invalid("MQTT subscription identities must be unique.");
    subscriptionIds.add(id);
  }
  const addresses = new Set<string>();
  for (const mapping of config.publish ?? []) {
    validateMqttTopicName(mapping.topic);
    validateQos(mapping.qos, "MQTT publish QoS");
    const address = normalizeAddress(mapping.address);
    if (address.sourceId !== config.identity.id)
      invalid("MQTT publish address sourceId must match adapter ID.");
    const key = dataPointAddressKey(address);
    if (addresses.has(key)) invalid("MQTT publish mappings must have unique addresses.");
    addresses.add(key);
    if (mapping.retain && !(mapping.allowRetain && config.permissions?.publish))
      invalid("Retained MQTT writes require allowRetain and publish permission.");
  }
}

export function extractMqttPath(root: unknown, path: MqttJsonPath | undefined): unknown {
  if (!path) return root;
  let value = root;
  for (const segment of path) {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}

export function compileMqttTopicTemplate(
  pattern: string,
  keyTemplate: string
): (topic: string) => string | undefined {
  const patternLevels = pattern.split("/");
  const names = new Set<string>();
  const compiled = patternLevels.map((level) => {
    const match = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/.exec(level);
    if (!match) {
      if (level.includes("{") || level.includes("}")) invalid("MQTT topic template is malformed.");
      return { literal: level } as const;
    }
    const name = match[1];
    if (name === undefined) invalid("MQTT topic template placeholder is malformed.");
    if (names.has(name) || ["__proto__", "prototype", "constructor"].includes(name))
      invalid("MQTT topic template contains a duplicate or unsafe placeholder.");
    names.add(name);
    return { name } as const;
  });
  for (const placeholder of keyTemplate.matchAll(/\{([^}]+)\}/g)) {
    const name = placeholder[1];
    if (name === undefined || !names.has(name))
      invalid("MQTT address key template references an unknown placeholder.");
  }
  return (topic: string): string | undefined => {
    const levels = topic.split("/");
    if (levels.length !== compiled.length) return undefined;
    const values = new Map<string, string>();
    for (const [index, part] of compiled.entries()) {
      const level = levels[index];
      if (level === undefined) return undefined;
      if ("literal" in part) {
        if (part.literal !== level) return undefined;
      } else values.set(part.name, level);
    }
    const key = keyTemplate.replace(
      /\{([^}]+)\}/g,
      (_whole, name: string) => values.get(name) ?? ""
    );
    return key.length > 0 && key.length <= 512 ? key : undefined;
  };
}
