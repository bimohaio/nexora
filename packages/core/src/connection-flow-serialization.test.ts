import { describe, expect, it } from "vitest";
import { createScadaDocument } from "./document.js";
import { serializeDocumentJson } from "./serialization.js";

describe("connection flow serialization", () => {
  it("persists configuration and excludes transient runtime state", () => {
    const base = createScadaDocument({ name: "Flow" });
    const document = {
      ...base,
      connections: [
        {
          id: "connection-1",
          name: "Flow",
          source: { nodeId: "a", portId: "out" },
          target: { nodeId: "b", portId: "in" },
          routing: "direct" as const,
          waypoints: [],
          medium: "water",
          direction: "forward" as const,
          style: {},
          layerId: base.layers[0]?.id ?? "layer",
          visible: true,
          locked: false,
          flowAnimation: {
            id: "main-flow",
            mode: "dash" as const,
            primitive: "scalar" as const,
            speed: 2
          }
        }
      ]
    };
    const serialized = serializeDocumentJson(document);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    expect(serialized.json).toContain('"flowAnimation"');
    expect(serialized.json).not.toMatch(/scheduler|elapsed|pathLength|geometryCache/);
  });
  it("keeps legacy documents valid without flow metadata", () => {
    const document = createScadaDocument({ name: "Legacy" });
    expect(serializeDocumentJson(document).success).toBe(true);
  });
});
