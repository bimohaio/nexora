/* eslint-disable @typescript-eslint/no-unnecessary-condition -- runtime validation remains defensive for untyped external configuration */
import { DataSourceError } from "@web-scada/datasource-core";
import type { ModbusAdapterConfig, ModbusPointDefinition } from "./contracts.js";
import { checked } from "./addressing.js";
import { registerSpan } from "./codec.js";

export function validateModbusConfig(config: Readonly<ModbusAdapterConfig>): void {
  if (!config.identity?.id?.trim()) fail("identity.id must be non-empty.");
  const connection = config.connection;
  if (connection.transport === "tcp") {
    if (!connection.host.trim()) fail("TCP host must be non-empty.");
    integer(connection.port ?? 502, 1, 65535, "TCP port");
  } else if (connection.transport !== "custom") fail("Unsupported Modbus transport.");
  integer(connection.unitId ?? 1, 0, 255, "unitId");
  positive(connection.requestTimeoutMs ?? 5000, "requestTimeoutMs");
  if (connection.transport === "tcp")
    positive(connection.connectTimeoutMs ?? 10000, "connectTimeoutMs");
  positive(config.polling?.intervalMs ?? 1000, "polling interval");
  integer(config.polling?.mergeGap ?? 0, 0, 65535, "mergeGap");
  integer(config.limits?.maxCoilsPerRead ?? 2000, 1, 2000, "maxCoilsPerRead");
  integer(config.limits?.maxRegistersPerRead ?? 125, 1, 125, "maxRegistersPerRead");
  integer(config.limits?.maxRegistersPerWrite ?? 123, 1, 123, "maxRegistersPerWrite");
  if (
    config.writes?.tolerance !== undefined &&
    (!Number.isFinite(config.writes.tolerance) || config.writes.tolerance < 0)
  )
    fail("Write tolerance must be finite and non-negative.");
  const ids = new Set<string>();
  for (const point of config.points) {
    validatePoint(point);
    if (ids.has(point.id)) fail(`Duplicate Modbus point id '${point.id}'.`);
    ids.add(point.id);
  }
}
export function validatePoint(point: Readonly<ModbusPointDefinition>): void {
  if (!point.id.trim()) fail("Point id must be non-empty.");
  checked(point.address);
  const registerArea =
    point.address.area === "holding-register" || point.address.area === "input-register";
  if (!registerArea && point.dataType !== "boolean")
    fail("Coil and discrete-input points must use boolean data type.");
  if (point.bitIndex !== undefined) integer(point.bitIndex, 0, 15, "bitIndex");
  if (
    point.dataType === "string" &&
    (!Number.isInteger(point.stringLength) || (point.stringLength ?? 0) <= 0)
  )
    fail("String points require a positive stringLength.");
  if (
    point.scale !== undefined &&
    (!Number.isFinite(point.scale) || (point.scale === 0 && point.writable))
  )
    fail("Scale must be finite and non-zero for writable points.");
  if (point.offset !== undefined && !Number.isFinite(point.offset)) fail("Offset must be finite.");
  if (point.deadband !== undefined && (!Number.isFinite(point.deadband) || point.deadband < 0))
    fail("Deadband must be finite and non-negative.");
  if (point.pollIntervalMs !== undefined) positive(point.pollIntervalMs, "point pollIntervalMs");
  if (point.writable && point.address.area !== "coil" && point.address.area !== "holding-register")
    fail("Only coils and holding registers are writable.");
  if (point.address.address + registerSpan(point) > 65536)
    fail("Point span exceeds the Modbus address range.");
}
function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be positive.`);
}
function integer(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${name} must be an integer from ${min} to ${max}.`);
}
function fail(message: string): never {
  throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}
