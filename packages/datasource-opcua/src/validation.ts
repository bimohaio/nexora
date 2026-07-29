import { DataSourceError } from "@web-scada/datasource-core";
import type { OpcUaAdapterConfig } from "./contracts.js";
import { parseOpcUaAddress } from "./addressing.js";

export function validateOpcUaConfig(config: Readonly<OpcUaAdapterConfig>): void {
  if (!config.identity.id.trim()) fail("identity.id must be non-empty.");
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpointUrl);
  } catch {
    fail("endpointUrl must be a valid URL.");
  }
  if (endpoint.protocol !== "opc.tcp:") fail("Only opc.tcp endpoints are supported.");
  const security = config.security ?? { mode: "None", policy: "None" };
  if ((security.mode === "None") !== (security.policy === "None"))
    fail("Security mode None must use policy None, and secure modes must use a secure policy.");
  if ((security.certificateFile === undefined) !== (security.privateKeyFile === undefined))
    fail("Client certificate and private key must be configured together.");
  if (security.automaticallyAcceptUnknownCertificate === true && security.mode !== "None")
    fail(
      "Unknown certificate auto-accept is restricted to explicit insecure development endpoints."
    );
  const identity = config.userIdentity ?? { type: "anonymous" };
  if (identity.type === "username" && !identity.secretRef.trim())
    fail("Username identity requires a non-empty secretRef.");
  if (
    identity.type === "certificate" &&
    (!identity.certificateRef.trim() || !identity.privateKeyRef.trim())
  )
    fail("Certificate identity requires certificate and private-key references.");
  if (identity.type !== "anonymous" && !config.secretProvider)
    fail("Non-anonymous identity requires a secretProvider.");
  positive(config.session?.requestedSessionTimeoutMs ?? 60_000, "requestedSessionTimeoutMs");
  positive(config.session?.operationTimeoutMs ?? 10_000, "operationTimeoutMs");
  positive(config.subscription?.publishingIntervalMs ?? 1_000, "publishingIntervalMs");
  positive(config.subscription?.samplingIntervalMs ?? 500, "samplingIntervalMs");
  integer(config.subscription?.queueSize ?? 10, 1, 10_000, "queueSize");
  integer(config.limits?.maxNodesPerRead ?? 100, 1, 10_000, "maxNodesPerRead");
  integer(config.limits?.maxNodesPerWrite ?? 100, 1, 10_000, "maxNodesPerWrite");
  const ids = new Set<string>();
  for (const point of config.points ?? []) {
    if (!point.id.trim() || ids.has(point.id)) fail("Point ids must be unique and non-empty.");
    parseOpcUaAddress(point.address);
    ids.add(point.id);
  }
}
function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be positive.`);
}
function integer(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${name} must be an integer from ${min} to ${max}.`);
}
function fail(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message, { recoverable: false });
}
