import type { JsonValue } from "@web-scada/core";
import type {
  DataPointAddress,
  DataPointValue,
  DataQuality,
  DataSourceMetadata
} from "@web-scada/datasource-core";
import { DataSourceError } from "@web-scada/datasource-core";
import { DataType, StatusCodes, type DataValue, type Variant } from "node-opcua";

export function normalizeStatusCode(statusCode: DataValue["statusCode"]): Readonly<DataQuality> {
  const code = statusCode.name;
  if (statusCode.isGood()) return Object.freeze({ level: "GOOD", reason: "GOOD", code });
  if (!statusCode.isBad())
    return Object.freeze({ level: "UNCERTAIN", reason: "UNKNOWN", code, message: code });
  const reason =
    statusCode === StatusCodes.BadUserAccessDenied || code.includes("AccessDenied")
      ? "ACCESS_DENIED"
      : code.includes("NodeIdUnknown") || code.includes("NotFound")
        ? "NOT_FOUND"
        : code.includes("Timeout")
          ? "TIMEOUT"
          : code.includes("NotConnected") || code.includes("Communication")
            ? "COMMUNICATION_FAILURE"
            : "UNKNOWN";
  return Object.freeze({ level: "BAD", reason, code, message: code });
}

export function decodeVariant(variant: Variant | null | undefined): JsonValue {
  if (!variant || variant.dataType === DataType.Null || variant.value == null) return null;
  return safeValue(variant.value, variant.dataType, 0, new WeakSet());
}

export function normalizeDataValue(
  address: Readonly<DataPointAddress>,
  dataValue: DataValue,
  receivedTimestamp = Date.now()
): Readonly<DataPointValue> {
  const sourceTimestamp = dataValue.sourceTimestamp?.getTime();
  const serverTimestamp = dataValue.serverTimestamp?.getTime();
  const metadata: DataSourceMetadata = Object.freeze({
    opcUaStatusCode: dataValue.statusCode.name,
    ...(serverTimestamp === undefined ? {} : { serverTimestamp })
  });
  const timestamp = sourceTimestamp ?? serverTimestamp;
  return Object.freeze({
    address: Object.freeze({ ...address }),
    value: decodeVariant(dataValue.value),
    quality: normalizeStatusCode(dataValue.statusCode),
    ...(timestamp === undefined ? {} : { sourceTimestamp: timestamp }),
    receivedTimestamp,
    metadata
  });
}

function safeValue(
  value: unknown,
  dataType: DataType,
  depth: number,
  seen: WeakSet<object>
): JsonValue {
  if (depth > 12) throw unsupported("OPC UA value exceeds the normalization depth limit.");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw unsupported("Non-finite OPC UA numbers are unsupported.");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return Object.freeze({ type: "ByteString", base64: Buffer.from(value).toString("base64") });
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const values = Array.from(value as ArrayLike<unknown>);
    if (values.length > 100_000) throw unsupported("OPC UA array exceeds the normalization limit.");
    return Object.freeze(values.map((item) => safeValue(item, dataType, depth + 1, seen)));
  }
  if (typeof value !== "object")
    throw unsupported(`Unsupported OPC UA value type '${typeof value}'.`);
  if (seen.has(value)) throw unsupported("Cyclic OPC UA values are unsupported.");
  seen.add(value);
  try {
    const candidate = value as {
      toString?: () => string;
      namespace?: number;
      namespaceUri?: string;
      identifierType?: { key?: string };
      value?: unknown;
      text?: string | null;
      locale?: string | null;
      name?: string;
    };
    if (dataType === DataType.NodeId || dataType === DataType.ExpandedNodeId)
      return Object.freeze({ type: DataType[dataType], value: String(candidate) });
    if (dataType === DataType.LocalizedText)
      return Object.freeze({
        text: candidate.text ?? "",
        ...(candidate.locale ? { locale: candidate.locale } : {})
      });
    if (dataType === DataType.QualifiedName)
      return Object.freeze({
        name: candidate.name ?? "",
        namespaceIndex: candidate.namespace ?? 0
      });
    if (dataType === DataType.StatusCode) return String(candidate);
    const entries = Object.entries(value);
    if (entries.length > 1_000) throw unsupported("OPC UA structure exceeds the property limit.");
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of entries) {
      if (key.startsWith("_") || typeof item === "function" || item === undefined) continue;
      result[key] = safeValue(item, DataType.ExtensionObject, depth + 1, seen);
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}
function unsupported(message: string): DataSourceError {
  return new DataSourceError("DATASOURCE_NORMALIZATION_ERROR", message, { recoverable: false });
}
