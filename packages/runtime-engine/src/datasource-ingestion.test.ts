import { describe, expect, it } from "vitest";
import type { DataSourceEvent } from "@web-scada/datasource-core";
import { InMemoryTagStore, createDataSourceRuntimeIngestion } from "./index.js";

const address = { sourceId: "sim", key: "temperature" };
function event(sequence: number, value: number, level: "GOOD" | "BAD" = "GOOD"): DataSourceEvent {
  return {
    type: "VALUE",
    adapter: { id: "sim", type: "simulator" },
    timestamp: 100 + sequence,
    value: {
      address,
      value,
      quality: { level, reason: level === "GOOD" ? "GOOD" : "SENSOR_FAILURE" },
      sourceTimestamp: 100 + sequence,
      receivedTimestamp: 100 + sequence,
      sequence
    }
  };
}

describe("data-source runtime ingestion", () => {
  it("maps normalized batches into one runtime revision and preserves quality changes", () => {
    const store = new InMemoryTagStore({ now: () => 500 });
    const diagnostics: string[] = [];
    const ingestion = createDataSourceRuntimeIngestion({
      target: store,
      mappings: [{ address, runtimeKey: "plant.temperature" }],
      onDiagnostic: ({ code }) => diagnostics.push(code)
    });
    const first = ingestion.ingestMany([event(1, 20), event(2, 21)]);
    expect(first?.revision).toBe(1);
    expect(store.getDataPoint("plant.temperature")).toMatchObject({ value: 21, quality: "good" });
    ingestion.ingest(event(3, 21, "BAD"));
    expect(store.getDataPoint("plant.temperature")).toMatchObject({
      value: 21,
      quality: "bad",
      qualityDetail: "sensor-failure"
    });
    const unmapped = event(4, 1);
    if (unmapped.type !== "VALUE") throw new Error("Expected value event.");
    ingestion.ingest({
      ...unmapped,
      value: { ...unmapped.value, address: { sourceId: "sim", key: "missing" } }
    });
    expect(diagnostics).toEqual(["RUNTIME_DATASOURCE_UNMAPPED"]);
  });

  it("rejects duplicate mappings", () => {
    expect(() =>
      createDataSourceRuntimeIngestion({
        target: new InMemoryTagStore(),
        mappings: [
          { address, runtimeKey: "a" },
          { address: { sourceId: "sim", key: "other" }, runtimeKey: "a" }
        ]
      })
    ).toThrow(/unique/);
  });
});
