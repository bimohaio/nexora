import { describe, expect, it } from "vitest";

import {
  SCADA_SCHEMA_VERSION,
  arePortMediumsCompatible,
  validateDocumentSemantics,
  validateDocumentStructure,
  type PortDefinition,
  type ScadaDocument
} from "./index.js";

const baseDocument: ScadaDocument = {
  schemaVersion: SCADA_SCHEMA_VERSION,
  id: "doc_01",
  metadata: {
    id: "doc_01",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 100,
    height: 100,
    background: "#fff",
    gridSize: 10,
    gridVisible: true,
    snapToGrid: true,
    coordinateUnit: "px",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "layer_01", name: "Default", order: 0, visible: true, locked: false }],
  nodes: [],
  connections: [],
  variables: [],
  bindings: [],
  runtimeSettings: { updateIntervalMs: 100 }
};

describe("document validation foundations", () => {
  it("parses the supported document version", () => {
    expect(validateDocumentStructure(baseDocument)).toEqual({ valid: true, issues: [] });
    expect(
      validateDocumentStructure({ ...baseDocument, schemaVersion: "0.9.0" }).issues[0]?.code
    ).toBe("DOCUMENT_VERSION_UNSUPPORTED");
  });

  it("detects duplicate node IDs", () => {
    const node = {
      id: "node_01",
      name: "Node",
      symbolType: "example",
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0 as const, scaleX: 1, scaleY: 1 },
      properties: {},
      bindings: [],
      layerId: "layer_01",
      visible: true,
      locked: false
    };
    const result = validateDocumentSemantics({ ...baseDocument, nodes: [node, node] });
    expect(result.issues.some(({ code }) => code === "NODE_ID_DUPLICATED")).toBe(true);
  });

  it("checks connection medium compatibility symmetrically", () => {
    const port = (medium: string, acceptedMediums: readonly string[]): PortDefinition => ({
      id: medium,
      label: medium,
      position: { x: 0, y: 0.5 },
      direction: "passive",
      medium,
      acceptedMediums,
      acceptedDirections: ["passive"]
    });
    expect(arePortMediumsCompatible(port("water", ["water"]), port("water", ["water"]))).toBe(true);
    expect(arePortMediumsCompatible(port("water", ["water"]), port("gas", ["gas"]))).toBe(false);
  });
});
