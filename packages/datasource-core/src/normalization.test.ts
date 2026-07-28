import { describe, expect, it } from "vitest";
import {
  DATA_QUALITY_RANK,
  DataSourceError,
  dataPointAddressKey,
  normalizeDataPointValue,
  normalizeDataQuality,
  normalizeJsonValue,
  normalizeTimestamp
} from "./index.js";

const address = { sourceId: "simulator-1", key: "tank.level", path: ["tank", "level"] };

describe("data-source normalization", () => {
  it.each([null, true, false, "value", 42])("normalizes JSON primitive %s", (value) => {
    expect(normalizeJsonValue(value)).toEqual(value);
  });

  it("copies and freezes nested JSON without mutating input", () => {
    const input = { nested: [{ value: 2 }] };
    const normalized = normalizeJsonValue(input);
    expect(normalized).toEqual(input);
    expect(normalized).not.toBe(input);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(input).toEqual({ nested: [{ value: 2 }] });
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    new Date(),
    new Uint8Array([1]),
    new Map(),
    new Set(),
    () => undefined,
    Symbol("invalid")
  ])("rejects unsupported value %#", (value) => {
    expect(() => normalizeJsonValue(value)).toThrow(DataSourceError);
  });

  it("rejects cycles and accessor properties without invoking getters", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => normalizeJsonValue(cyclic)).toThrow(/Cyclic/);
    let invoked = false;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "token";
      }
    });
    expect(() => normalizeJsonValue(accessor)).toThrow(/Accessor/);
    expect(invoked).toBe(false);
  });

  it("enforces documented limits", () => {
    expect(() =>
      normalizeJsonValue("long", {
        maxDepth: 3,
        maxArrayLength: 3,
        maxObjectKeys: 3,
        maxStringLength: 2
      })
    ).toThrow(/String/);
  });

  it("normalizes missing and unknown quality conservatively", () => {
    expect(normalizeDataQuality(undefined)).toEqual({ level: "UNKNOWN", reason: "UNKNOWN" });
    expect(normalizeDataQuality("vendor-goodish")).toEqual({
      level: "UNKNOWN",
      reason: "UNKNOWN",
      code: "vendor-goodish"
    });
    expect(normalizeDataQuality(true)).toEqual({ level: "GOOD", reason: "GOOD" });
  });

  it("validates canonical quality and ranking", () => {
    expect(normalizeDataQuality({ level: "BAD", reason: "TIMEOUT", code: "0x01" })).toEqual({
      level: "BAD",
      reason: "TIMEOUT",
      code: "0x01",
      message: undefined
    });
    expect(DATA_QUALITY_RANK.GOOD).toBeLessThan(DATA_QUALITY_RANK.UNCERTAIN);
    expect(DATA_QUALITY_RANK.UNCERTAIN).toBeLessThan(DATA_QUALITY_RANK.UNKNOWN);
    expect(DATA_QUALITY_RANK.UNKNOWN).toBeLessThan(DATA_QUALITY_RANK.BAD);
  });

  it("requires explicit epoch milliseconds", () => {
    expect(normalizeTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
    for (const value of ["2026-01-01", Number.NaN, Infinity, -1]) {
      expect(() => normalizeTimestamp(value)).toThrow(DataSourceError);
    }
  });

  it("normalizes values deterministically with timestamp diagnostics", () => {
    const input = {
      address,
      value: { level: 12 },
      quality: undefined,
      metadata: { unit: "%" }
    };
    const one = normalizeDataPointValue(input, { receivedTimestamp: 1000 });
    const two = normalizeDataPointValue(input, { receivedTimestamp: 1000 });
    expect(one).toEqual(two);
    expect(one.quality.level).toBe("UNKNOWN");
    expect(one.sourceTimestamp).toBeUndefined();
    expect(one.diagnostics?.map((entry) => entry.code)).toEqual([
      "DATASOURCE_TIMESTAMP_FALLBACK",
      "DATASOURCE_QUALITY_UNKNOWN"
    ]);
    expect(input).toEqual({
      address,
      value: { level: 12 },
      quality: undefined,
      metadata: { unit: "%" }
    });
  });

  it("produces unambiguous stable address keys", () => {
    expect(dataPointAddressKey(address)).toBe(dataPointAddressKey({ ...address }));
    expect(dataPointAddressKey({ sourceId: "a", key: "b|c" })).not.toBe(
      dataPointAddressKey({ sourceId: "a|b", key: "c" })
    );
  });
});
