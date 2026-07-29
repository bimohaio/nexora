import type { ModbusDataArea, ModbusPointDefinition, ModbusProtocolLimits } from "./contracts.js";
import { registerSpan } from "./codec.js";

export interface ModbusPollGroup {
  readonly unitId: number;
  readonly area: ModbusDataArea;
  readonly intervalMs: number;
  readonly start: number;
  readonly quantity: number;
  readonly points: readonly Readonly<ModbusPointDefinition>[];
}
export function buildPollingPlan(
  points: readonly Readonly<ModbusPointDefinition>[],
  defaults: {
    unitId: number;
    intervalMs: number;
    mergeGap: number;
    limits?: Readonly<ModbusProtocolLimits>;
  }
): readonly Readonly<ModbusPollGroup>[] {
  const buckets = new Map<string, ModbusPointDefinition[]>();
  for (const point of points) {
    const unitId = point.address.unitId ?? defaults.unitId;
    const interval = point.pollIntervalMs ?? defaults.intervalMs;
    const key = `${unitId}|${point.address.area}|${interval}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  const groups: ModbusPollGroup[] = [];
  for (const [key, bucket] of buckets) {
    const [unitText, area, intervalText] = key.split("|") as [string, ModbusDataArea, string];
    const unitId = Number(unitText),
      intervalMs = Number(intervalText);
    const limit =
      area === "coil" || area === "discrete-input"
        ? (defaults.limits?.maxCoilsPerRead ?? 2000)
        : (defaults.limits?.maxRegistersPerRead ?? 125);
    const sorted = [...bucket].sort(
      (a, b) => a.address.address - b.address.address || a.id.localeCompare(b.id)
    );
    let current: ModbusPointDefinition[] = [],
      start = 0,
      end = 0;
    const flush = () => {
      if (current.length)
        groups.push(
          Object.freeze({
            unitId,
            area,
            intervalMs,
            start,
            quantity: end - start,
            points: Object.freeze(current)
          })
        );
    };
    for (const point of sorted) {
      const pointStart = point.address.address,
        pointEnd = pointStart + registerSpan(point);
      if (!current.length) {
        current = [point];
        start = pointStart;
        end = pointEnd;
        continue;
      }
      if (pointStart - end <= defaults.mergeGap && Math.max(end, pointEnd) - start <= limit) {
        current.push(point);
        end = Math.max(end, pointEnd);
      } else {
        flush();
        current = [point];
        start = pointStart;
        end = pointEnd;
      }
    }
    flush();
  }
  return Object.freeze(
    groups.sort(
      (a, b) =>
        a.intervalMs - b.intervalMs ||
        a.unitId - b.unitId ||
        a.area.localeCompare(b.area) ||
        a.start - b.start
    )
  );
}
