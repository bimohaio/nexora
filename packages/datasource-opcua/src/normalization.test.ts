import { describe, expect, it } from "vitest";
import { DataType, DataValue, StatusCodes, Variant, VariantArrayType } from "node-opcua";
import { decodeVariant, normalizeDataValue } from "./normalization.js";

describe("OPC UA normalization", () => {
  it("normalizes quality and source/server timestamps", () => {
    const value = normalizeDataValue(
      { sourceId: "opc", key: "temperature" },
      new DataValue({
        value: new Variant({ dataType: DataType.Double, value: 12.5 }),
        statusCode: StatusCodes.Good,
        sourceTimestamp: new Date("2026-01-02T03:04:05.000Z"),
        serverTimestamp: new Date("2026-01-02T03:04:06.000Z")
      }),
      42
    );
    expect(value.value).toBe(12.5);
    expect(value.quality).toMatchObject({ level: "GOOD", code: "Good" });
    expect(value.sourceTimestamp).toBe(Date.parse("2026-01-02T03:04:05.000Z"));
    expect(value.metadata?.serverTimestamp).toBe(Date.parse("2026-01-02T03:04:06.000Z"));
    expect(value.receivedTimestamp).toBe(42);
  });

  it("preserves unsafe integers and ByteStrings safely", () => {
    expect(
      decodeVariant(
        new Variant({
          dataType: DataType.Int64,
          arrayType: VariantArrayType.Scalar,
          value: [0x200000, 1]
        })
      )
    ).toEqual([2097152, 1]);
    expect(
      decodeVariant(new Variant({ dataType: DataType.ByteString, value: Buffer.from([1, 2, 3]) }))
    ).toEqual({ type: "ByteString", base64: "AQID" });
  });

  it("maps bad status without leaking library objects", () => {
    const value = normalizeDataValue(
      { sourceId: "opc", key: "missing" },
      new DataValue({ statusCode: StatusCodes.BadNodeIdUnknown }),
      1
    );
    expect(value).toMatchObject({
      value: null,
      quality: { level: "BAD", reason: "NOT_FOUND", code: "BadNodeIdUnknown" }
    });
  });
});
