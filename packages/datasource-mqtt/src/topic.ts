import { DataSourceError } from "@web-scada/datasource-core";

const encoder = new TextEncoder();

function invalid(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}

function validateUtf8(value: string, label: string): void {
  if (value.includes("\0")) invalid(`${label} must not contain a null character.`);
  if (encoder.encode(value).byteLength > 65_535) invalid(`${label} exceeds the MQTT UTF-8 limit.`);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdfff) {
      const validPair =
        code <= 0xdbff &&
        index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 &&
        value.charCodeAt(index + 1) <= 0xdfff;
      if (!validPair) invalid(`${label} is not valid UTF-8 text.`);
      index++;
    }
  }
}

export function validateMqttTopicName(topic: string): void {
  if (topic === "") invalid("MQTT topic name must not be empty.");
  validateUtf8(topic, "MQTT topic name");
  if (topic.includes("+") || topic.includes("#"))
    invalid("MQTT topic name must not contain wildcard characters.");
}

export function underlyingMqttTopicFilter(filter: string): string {
  if (!filter.startsWith("$share/")) return filter;
  const slash = filter.indexOf("/", 7);
  if (slash < 0 || slash === 7) invalid("MQTT shared subscription group must be non-empty.");
  const group = filter.slice(7, slash);
  if (group.includes("+") || group.includes("#"))
    invalid("MQTT shared subscription group must not contain wildcards.");
  const underlying = filter.slice(slash + 1);
  if (underlying === "") invalid("MQTT shared subscription filter must be non-empty.");
  return underlying;
}

export function validateMqttTopicFilter(filter: string): void {
  if (filter === "") invalid("MQTT topic filter must not be empty.");
  validateUtf8(filter, "MQTT topic filter");
  const underlying = underlyingMqttTopicFilter(filter);
  const levels = underlying.split("/");
  for (const [index, level] of levels.entries()) {
    if (level.includes("+") && level !== "+")
      invalid("MQTT '+' wildcard must occupy an entire topic level.");
    if (level.includes("#") && (level !== "#" || index !== levels.length - 1))
      invalid("MQTT '#' wildcard must occupy the final entire topic level.");
  }
}

export function mqttTopicMatchesFilter(filter: string, topic: string): boolean {
  validateMqttTopicFilter(filter);
  validateMqttTopicName(topic);
  const actualFilter = underlyingMqttTopicFilter(filter);
  if (topic.startsWith("$") && !actualFilter.startsWith("$")) return false;
  const filterLevels = actualFilter.split("/");
  const topicLevels = topic.split("/");
  for (let index = 0; index < filterLevels.length; index++) {
    const filterLevel = filterLevels[index];
    if (filterLevel === "#") return true;
    if (index >= topicLevels.length) return false;
    if (filterLevel !== "+" && filterLevel !== topicLevels[index]) return false;
  }
  return filterLevels.length === topicLevels.length;
}
