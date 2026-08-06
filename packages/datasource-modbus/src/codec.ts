/* eslint-disable @typescript-eslint/no-misused-spread, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-expressions -- preserve byte-oriented Modbus codec semantics */
import { DataSourceError } from "@web-scada/datasource-core";
import type { ModbusPointDefinition } from "./contracts.js";

export function registerSpan(point: Readonly<ModbusPointDefinition>): number {
  if (point.address.area === "coil" || point.address.area === "discrete-input")
    return point.address.quantity ?? 1;
  if (point.dataType === "string") return Math.ceil((point.stringLength ?? 0) / 2);
  if (point.dataType === "registers") return point.address.quantity ?? 1;
  return (
    {
      boolean: 1,
      uint16: 1,
      int16: 1,
      bitfield16: 1,
      uint32: 2,
      int32: 2,
      float32: 2,
      uint64: 4,
      int64: 4,
      float64: 4
    } as const
  )[point.dataType];
}
function bytes(registers: readonly number[], point: Readonly<ModbusPointDefinition>): Uint8Array {
  const words = [...registers];
  if ((point.wordOrder ?? "high-word-first") === "low-word-first") words.reverse();
  const output = new Uint8Array(words.length * 2);
  words.forEach((word, index) => {
    if (!Number.isInteger(word) || word < 0 || word > 65535)
      fail("Transport returned an invalid register.");
    const high = word >>> 8,
      low = word & 255;
    const offset = index * 2;
    if ((point.byteOrder ?? "big-endian") === "big-endian") {
      output[offset] = high;
      output[offset + 1] = low;
    } else {
      output[offset] = low;
      output[offset + 1] = high;
    }
  });
  return output;
}
export function decodeRegisters(
  registers: readonly number[],
  point: Readonly<ModbusPointDefinition>
): boolean | number | string | readonly number[] {
  if (registers.length < registerSpan(point))
    fail("Register response is shorter than the point span.");
  if (point.dataType === "registers") return Object.freeze(registers.slice(0, registerSpan(point)));
  const data = bytes(registers.slice(0, registerSpan(point)), point);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let value: boolean | number | string;
  switch (point.dataType) {
    case "boolean":
      value =
        point.bitIndex === undefined
          ? view.getUint16(0) !== 0
          : ((view.getUint16(0) >>> point.bitIndex) & 1) === 1;
      break;
    case "bitfield16":
    case "uint16":
      value = view.getUint16(0);
      break;
    case "int16":
      value = view.getInt16(0);
      break;
    case "uint32":
      value = view.getUint32(0);
      break;
    case "int32":
      value = view.getInt32(0);
      break;
    case "float32":
      value = view.getFloat32(0);
      break;
    case "float64":
      value = view.getFloat64(0);
      break;
    case "uint64": {
      const n = view.getBigUint64(0);
      value = n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString();
      break;
    }
    case "int64": {
      const n = view.getBigInt64(0);
      value =
        n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(n)
          : n.toString();
      break;
    }
    case "string": {
      let selected = data.slice(0, point.stringLength);
      if (point.nullTerminated !== false) {
        const zero = selected.indexOf(0);
        if (zero >= 0) selected = selected.slice(0, zero);
      }
      value = new TextDecoder(point.stringEncoding ?? "ascii", { fatal: true }).decode(selected);
      if (point.trim) value = value.trim();
      break;
    }
    default:
      fail("Unsupported register data type.");
  }
  if (typeof value === "number" && point.dataType !== "bitfield16")
    value = value * (point.scale ?? 1) + (point.offset ?? 0);
  return value;
}
export function encodeRegisters(
  value: unknown,
  point: Readonly<ModbusPointDefinition>
): readonly number[] {
  if (point.dataType === "registers") {
    if (
      !Array.isArray(value) ||
      value.some((item) => !Number.isInteger(item) || item < 0 || item > 65535)
    )
      fail("Registers must be an array of 16-bit unsigned integers.");
    if (value.length !== registerSpan(point))
      fail("Register array length does not match point quantity.");
    return Object.freeze(value as number[]);
  }
  if (point.dataType === "string") {
    if (typeof value !== "string") fail("String point requires a string.");
    const encoded = new TextEncoder().encode(value);
    if (
      (point.stringEncoding ?? "ascii") === "ascii" &&
      [...value].some((character) => character.codePointAt(0)! > 127)
    )
      fail("ASCII point contains non-ASCII characters.");
    if (encoded.length > (point.stringLength ?? 0)) fail("String exceeds configured length.");
    const data = new Uint8Array(registerSpan(point) * 2);
    data.set(encoded);
    return words(data, point);
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    fail("Numeric point requires a finite number.");
  const raw = (value - (point.offset ?? 0)) / (point.scale ?? 1);
  const size = registerSpan(point) * 2,
    data = new Uint8Array(size),
    view = new DataView(data.buffer);
  const integer = (min: number, max: number): number => {
    let n = raw;
    const rounding = point.integerRounding ?? "reject-fraction";
    if (!Number.isInteger(n)) {
      if (rounding === "reject-fraction") fail("Integer encoding would lose a fractional value.");
      n = Math[rounding === "truncate" ? "trunc" : rounding](n);
    }
    if (n < min || n > max) fail("Numeric value exceeds the target data type range.");
    return n;
  };
  switch (point.dataType) {
    case "boolean":
    case "bitfield16":
    case "uint16":
      view.setUint16(0, integer(0, 65535));
      break;
    case "int16":
      view.setInt16(0, integer(-32768, 32767));
      break;
    case "uint32":
      view.setUint32(0, integer(0, 4294967295));
      break;
    case "int32":
      view.setInt32(0, integer(-2147483648, 2147483647));
      break;
    case "float32":
      view.setFloat32(0, raw);
      break;
    case "float64":
      view.setFloat64(0, raw);
      break;
    case "uint64":
    case "int64": {
      if (!Number.isSafeInteger(raw)) fail("64-bit writes require a safe integer number.");
      point.dataType === "uint64"
        ? view.setBigUint64(0, BigInt(raw))
        : view.setBigInt64(0, BigInt(raw));
      break;
    }
    default:
      fail("Unsupported encoded type.");
  }
  return words(data, point);
}
function words(data: Uint8Array, point: Readonly<ModbusPointDefinition>): readonly number[] {
  const result: number[] = [];
  for (let index = 0; index < data.length; index += 2)
    result.push((data[index]! << 8) | data[index + 1]!);
  if ((point.byteOrder ?? "big-endian") === "little-endian")
    for (let i = 0; i < result.length; i++)
      result[i] = ((result[i]! & 255) << 8) | (result[i]! >>> 8);
  if ((point.wordOrder ?? "high-word-first") === "low-word-first") result.reverse();
  return Object.freeze(result);
}
function fail(message: string): never {
  throw new DataSourceError("DATASOURCE_PARSE_ERROR", message);
}
