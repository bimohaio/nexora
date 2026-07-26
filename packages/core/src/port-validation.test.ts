import { describe, expect, it } from "vitest";

import {
  checkPortCompatibility,
  validateDocumentSemantics,
  type PortDefinition,
  type ScadaConnection,
  type ScadaNode,
  type ValidationSymbolDefinition
} from "./index.js";
import { createTestDocument } from "./testing.test-helper.js";

const port = (
  id: string,
  direction: PortDefinition["direction"],
  medium: string,
  maxConnections?: number
): PortDefinition => ({
  id,
  label: id,
  position: { x: direction === "input" ? 0 : 1, y: 0.5 },
  direction,
  medium,
  ...(maxConnections === undefined ? {} : { maxConnections }),
  acceptedMediums: [],
  acceptedDirections: []
});

describe("port compatibility", () => {
  it("handles direction and medium rules including generic media", () => {
    expect(
      checkPortCompatibility(port("out", "output", "water"), port("in", "input", "water"))
        .compatible
    ).toBe(true);
    expect(
      checkPortCompatibility(port("out", "output", "water"), port("in", "input", "generic"))
        .compatible
    ).toBe(true);
    expect(
      checkPortCompatibility(port("out", "output", "water"), port("in", "input", "gas")).reasonCode
    ).toBe("PORT_MEDIUM_INCOMPATIBLE");
    expect(
      checkPortCompatibility(port("a", "input", "water"), port("b", "input", "water")).reasonCode
    ).toBe("PORT_DIRECTION_INCOMPATIBLE");
    expect(
      checkPortCompatibility(port("a", "passive", "signal"), port("b", "passive", "signal"))
        .compatible
    ).toBe(true);
  });

  it("detects missing ports, incompatibility, and maximum counts with injected symbols", () => {
    const document = createTestDocument();
    const layerId = document.layers[0]?.id ?? "";
    const node = (id: string, symbolType: string): ScadaNode => ({
      id,
      name: id,
      symbolType,
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      properties: {},
      bindings: [],
      layerId,
      visible: true,
      locked: false
    });
    const definitions: ValidationSymbolDefinition[] = [
      { type: "source", ports: [port("out", "output", "water", 1)] },
      { type: "target", ports: [port("in", "input", "gas")] }
    ];
    const symbolRegistry = {
      has: (type: string) => definitions.some((definition) => definition.type === type),
      get: (type: string) => definitions.find((definition) => definition.type === type)
    };
    const connection = (id: string, portId = "in"): ScadaConnection => ({
      id,
      name: id,
      source: { nodeId: "node_source", portId: "out" },
      target: { nodeId: "node_target", portId },
      routing: "direct",
      waypoints: [],
      medium: "water",
      direction: "forward",
      style: {},
      layerId,
      visible: true,
      locked: false
    });
    const result = validateDocumentSemantics(
      {
        ...document,
        nodes: [node("node_source", "source"), node("node_target", "target")],
        connections: [connection("conn_a"), connection("conn_b", "missing")]
      },
      { symbolRegistry }
    );
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "PORT_MEDIUM_INCOMPATIBLE",
        "CONNECTION_TARGET_PORT_NOT_FOUND",
        "PORT_MAX_CONNECTIONS_EXCEEDED"
      ])
    );
  });
});
