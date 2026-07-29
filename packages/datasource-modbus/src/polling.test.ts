import { describe, expect, it } from "vitest";
import { buildPollingPlan } from "./polling.js";
import type { ModbusPointDefinition } from "./contracts.js";

const point = (
  id: string,
  address: number,
  dataType: ModbusPointDefinition["dataType"] = "uint16"
): ModbusPointDefinition => ({
  id,
  address: { area: "holding-register", address },
  dataType
});
describe("Modbus polling plan", () => {
  it("groups spans deterministically without oversized gaps", () => {
    const groups = buildPollingPlan(
      [point("a", 0), point("b", 1), point("float", 4, "float32"), point("far", 20)],
      {
        unitId: 1,
        intervalMs: 1000,
        mergeGap: 3
      }
    );
    expect(groups.map(({ start, quantity }) => [start, quantity])).toEqual([
      [0, 6],
      [20, 1]
    ]);
  });
  it("respects the register request limit", () => {
    const groups = buildPollingPlan([point("a", 0), point("b", 4)], {
      unitId: 1,
      intervalMs: 1000,
      mergeGap: 4,
      limits: { maxRegistersPerRead: 4 }
    });
    expect(groups).toHaveLength(2);
  });
});
