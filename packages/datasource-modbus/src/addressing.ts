import { DataSourceError, type DataPointAddress } from "@web-scada/datasource-core";
import type { ModbusDataArea, ModbusPointAddress } from "./contracts.js";

const AREAS: readonly ModbusDataArea[] = [
  "coil",
  "discrete-input",
  "input-register",
  "holding-register"
];

export function parseModbusAddress(input: string): Readonly<ModbusPointAddress> {
  const text = input.trim();
  const unitMatch = /^unit=(\d+);(.+)$/.exec(text);
  const unitId = unitMatch ? Number(unitMatch[1]) : undefined;
  const body = unitMatch?.[2] ?? text;
  const explicit = /^([a-z-]+):(\d+)$/.exec(body);
  if (explicit && AREAS.includes(explicit[1] as ModbusDataArea))
    return checked({
      area: explicit[1] as ModbusDataArea,
      address: Number(explicit[2]),
      ...(unitId === undefined ? {} : { unitId })
    });
  if (/^\d+$/.test(body)) {
    const reference = Number(body);
    const ranges: readonly [number, number, ModbusDataArea][] = [
      [1, 9999, "coil"],
      [10001, 19999, "discrete-input"],
      [30001, 39999, "input-register"],
      [40001, 49999, "holding-register"]
    ];
    const range = ranges.find(([start, end]) => reference >= start && reference <= end);
    if (range)
      return checked({
        area: range[2],
        address: reference - range[0],
        ...(unitId === undefined ? {} : { unitId })
      });
  }
  throw configuration(`Malformed Modbus address '${input}'.`);
}
export function modbusDataPointAddress(sourceId: string, pointId: string): DataPointAddress {
  return Object.freeze({ sourceId, key: pointId });
}
export function checked(address: ModbusPointAddress): Readonly<ModbusPointAddress> {
  if (
    !AREAS.includes(address.area) ||
    !Number.isSafeInteger(address.address) ||
    address.address < 0 ||
    address.address > 65535
  )
    throw configuration("Modbus protocol address must be an integer from 0 to 65535.");
  if (
    address.unitId !== undefined &&
    (!Number.isInteger(address.unitId) || address.unitId < 0 || address.unitId > 255)
  )
    throw configuration("Modbus unitId must be an integer from 0 to 255.");
  return Object.freeze({ ...address });
}
function configuration(message: string): DataSourceError {
  return new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", message);
}
