import { parseDocument } from "@web-scada/core";
import { createIndustrialSymbolEnvironment } from "@web-scada/renderer-svg";
import { describe, expect, it } from "vitest";
import { getRuntimeDemoSample, RUNTIME_DEMO_SAMPLES } from "./sample-catalog.js";

describe("runtime demo sample catalog", () => {
  it("provides five valid Phase 10 industrial scenarios", () => {
    const symbols = createIndustrialSymbolEnvironment().symbolRegistry;
    expect(RUNTIME_DEMO_SAMPLES.map(({ id }) => id)).toEqual([
      "water",
      "power",
      "factory",
      "building",
      "tank-farm"
    ]);
    for (const sample of RUNTIME_DEMO_SAMPLES) {
      const parsed = parseDocument(sample.document, { symbolRegistry: symbols });
      expect(parsed.success, sample.label).toBe(true);
      expect(sample.document.bindings.length).toBeGreaterThan(0);
      expect(sample.document.connections.length).toBeGreaterThan(0);
      expect(sample.document.nodes.some(({ id }) => id.startsWith("node_animation_"))).toBe(true);
    }
  });

  it("falls back deterministically to water treatment", () => {
    expect(getRuntimeDemoSample("missing").id).toBe("water");
  });
});
