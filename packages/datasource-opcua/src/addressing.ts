import { DataSourceError, type DataPointAddress } from "@web-scada/datasource-core";

export type ParsedOpcUaAddress =
  | { readonly kind: "nodeId"; readonly value: string }
  | { readonly kind: "expandedNodeId"; readonly namespaceUri: string; readonly identifier: string }
  | { readonly kind: "browsePath"; readonly segments: readonly string[] };

const NODE_ID = /^ns=(\d+);([isgb])=(.+)$/u;

export function parseOpcUaAddress(input: string): ParsedOpcUaAddress {
  const value = input.trim();
  if (value.startsWith("/")) {
    const segments = value
      .split("/")
      .slice(1)
      .map((part) => decodeURIComponent(part))
      .filter(Boolean);
    if (segments.length === 0 || segments.some((part) => !part.trim()))
      fail("Invalid browse path.");
    return Object.freeze({ kind: "browsePath", segments: Object.freeze(segments) });
  }
  if (value.startsWith("nsu=")) {
    const separator = value.indexOf(";");
    if (separator < 5 || !/^[isgb]=.+$/u.test(value.slice(separator + 1)))
      fail("Invalid ExpandedNodeId.");
    return Object.freeze({
      kind: "expandedNodeId",
      namespaceUri: decodeURIComponent(value.slice(4, separator)),
      identifier: value.slice(separator + 1)
    });
  }
  const match = NODE_ID.exec(value);
  if (!match || Number(match[1]) > 65_535) fail("Invalid OPC UA NodeId.");
  const identifierType = match[2];
  const identifier = match[3] ?? "";
  if (identifierType === "i" && !/^\d+$/u.test(identifier)) fail("Invalid numeric NodeId.");
  if (
    identifierType === "g" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(identifier)
  )
    fail("Invalid GUID NodeId.");
  if (identifierType === "b" && !/^[A-Za-z0-9+/]+={0,2}$/u.test(identifier))
    fail("Invalid ByteString NodeId.");
  return Object.freeze({ kind: "nodeId", value });
}

export function opcUaDataPointAddress(
  sourceId: string,
  key: string,
  address = key
): Readonly<DataPointAddress> {
  parseOpcUaAddress(address);
  return Object.freeze({
    sourceId,
    key,
    extensions: Object.freeze({ opcUaAddress: address })
  });
}
function fail(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message, { recoverable: false });
}
