import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocumentJson } from "@web-scada/core";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";

const samples = [
  "process.scada.json",
  "electrical.scada.json",
  "instrumentation.scada.json",
  "bms.scada.json",
  "mixed-system.scada.json"
] as const;

describe("Phase 3 industrial sample documents", () => {
  it.each(samples)("validates %s through the Phase 1 import pipeline", (sample) => {
    const json = readFileSync(
      new URL(`../../examples/industrial/${sample}`, import.meta.url),
      "utf8"
    );
    const result = parseDocumentJson(json, {
      symbolRegistry: createIndustrialSymbolRegistry()
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.nodes.length).toBeGreaterThan(0);
      expect(result.document.metadata.tags).toContain("phase-3");
    }
  });
});
