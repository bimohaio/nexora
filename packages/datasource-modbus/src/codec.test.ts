import { describe, expect, it } from "vitest";
import { decodeRegisters, encodeRegisters } from "./codec.js";
import type { ModbusPointDefinition } from "./contracts.js";

const point = (
  dataType: ModbusPointDefinition["dataType"],
  extra: Partial<ModbusPointDefinition> = {}
): ModbusPointDefinition => ({
  id: "point",
  address: { area: "holding-register", address: 0 },
  dataType,
  ...extra
});
describe("Modbus codec", () => {
  it.each([
    ["big-endian", "high-word-first", [0x1234, 0x5678]],
    ["little-endian", "high-word-first", [0x3412, 0x7856]],
    ["big-endian", "low-word-first", [0x5678, 0x1234]],
    ["little-endian", "low-word-first", [0x7856, 0x3412]]
  ] as const)("decodes deterministic 32-bit ordering", (byteOrder, wordOrder, registers) => {
    expect(decodeRegisters(registers, point("uint32", { byteOrder, wordOrder }))).toBe(0x12345678);
  });
  it("round-trips scaled float values", () => {
    const definition = point("float32", {
      scale: 2,
      offset: 3,
      byteOrder: "little-endian",
      wordOrder: "low-word-first"
    });
    expect(decodeRegisters(encodeRegisters(13, definition), definition)).toBeCloseTo(13);
  });
  it("uses decimal strings when 64-bit values exceed JSON-safe integer precision", () => {
    expect(decodeRegisters([0xffff, 0xffff, 0xffff, 0xffff], point("uint64"))).toBe(
      "18446744073709551615"
    );
  });
  it("rejects integer overflow", () => {
    expect(() => encodeRegisters(65536, point("uint16"))).toThrow(/range/);
  });
});
