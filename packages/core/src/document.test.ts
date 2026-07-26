import { describe, expect, it } from "vitest";

import {
  DeterministicIdGenerator,
  FixedClock,
  MigrationRegistry,
  SCADA_SCHEMA_VERSION,
  UlidEntityIdGenerator,
  compareSchemaVersions,
  createScadaDocument,
  detectParentCycles,
  isJsonValue,
  parseDocument,
  parseDocumentJson,
  parseSchemaVersion,
  serializeDocumentJson,
  validateDocumentSemantics,
  validateDocumentStructure,
  type DocumentMigration,
  type ScadaNode
} from "./index.js";
import { TEST_TIME, createTestDocument } from "./testing.test-helper.js";

describe("document factory and normalization", () => {
  it("creates a deterministic valid default document", () => {
    const document = createTestDocument();
    expect(document.id).toBe("doc_0001");
    expect(document.layers).toEqual([
      { id: "layer_0001", name: "Default", order: 0, visible: true, locked: false }
    ]);
    expect(document.metadata).toMatchObject({
      name: "Test Process",
      tags: ["water", "plant"],
      createdAt: TEST_TIME,
      updatedAt: TEST_TIME
    });
    expect(validateDocumentStructure(document).valid).toBe(true);
    expect(validateDocumentSemantics(document).valid).toBe(true);
  });

  it("applies safe canvas overrides", () => {
    const document = createScadaDocument({
      name: "Small",
      canvas: { width: 800, height: 600 },
      idGenerator: new DeterministicIdGenerator(),
      clock: new FixedClock(TEST_TIME)
    });
    expect(document.canvas).toMatchObject({ width: 800, height: 600, gridSize: 10 });
  });

  it("generates prefixed unique production IDs", () => {
    const generator = new UlidEntityIdGenerator();
    const ids = new Set(Array.from({ length: 1000 }, () => generator.createNodeId()));
    expect(ids.size).toBe(1000);
    expect([...ids].every((id) => id.startsWith("node_"))).toBe(true);
  });
});

describe("structural validation", () => {
  it("rejects non-objects and missing fields with JSON Pointer paths", () => {
    expect(validateDocumentStructure(null).issues[0]).toMatchObject({
      code: "DOCUMENT_SCHEMA_INVALID",
      path: ""
    });
    const result = validateDocumentStructure({ schemaVersion: SCADA_SCHEMA_VERSION });
    expect(result.valid).toBe(false);
    expect(result.issues.some(({ path }) => path === "/metadata")).toBe(true);
  });

  it("rejects invalid node dimensions and non-JSON values", () => {
    const document = createTestDocument();
    const invalid = {
      ...document,
      nodes: [
        {
          id: "node_bad",
          name: "Bad",
          symbolType: "basic.rectangle",
          transform: { x: 0, y: 0, width: 0, height: 1, rotation: 0, scaleX: 1, scaleY: 1 },
          properties: { invalid: Number.NaN },
          bindings: [],
          layerId: document.layers[0]?.id,
          visible: true,
          locked: false
        }
      ]
    };
    const result = validateDocumentStructure(invalid);
    expect(result.issues.map(({ code }) => code)).toContain("NODE_DIMENSIONS_INVALID");
    expect(result.issues.map(({ code }) => code)).toContain("NODE_PROPERTIES_INVALID");
  });

  it("validates JSON-safe values including cycles", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonValue({ array: [1, "x", null] })).toBe(true);
    expect(isJsonValue(cyclic)).toBe(false);
    expect(isJsonValue(BigInt(1))).toBe(false);
  });
});

describe("semantic validation", () => {
  const node = (id: string, layerId: string, parentId?: string): ScadaNode => ({
    id,
    name: id,
    symbolType: "basic.rectangle",
    transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
    properties: {},
    bindings: [],
    layerId,
    ...(parentId === undefined ? {} : { parentId }),
    visible: true,
    locked: false
  });

  it("detects duplicate IDs, missing layers, and missing parents", () => {
    const document = createTestDocument();
    const layerId = document.layers[0]?.id ?? "";
    const duplicate = node("node_a", layerId);
    const result = validateDocumentSemantics({
      ...document,
      nodes: [duplicate, duplicate, node("node_b", "layer_missing", "node_missing")]
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "NODE_ID_DUPLICATED",
        "NODE_LAYER_NOT_FOUND",
        "NODE_PARENT_NOT_FOUND"
      ])
    );
  });

  it("detects self, two-node, and longer parent cycles without looping", () => {
    const document = createTestDocument();
    const layerId = document.layers[0]?.id ?? "";
    expect(detectParentCycles({ nodes: [node("node_a", layerId)] })).toEqual([]);
    expect(detectParentCycles({ nodes: [node("node_a", layerId, "node_a")] })).toEqual([
      ["node_a"]
    ]);
    expect(
      detectParentCycles({
        nodes: [
          node("node_a", layerId, "node_b"),
          node("node_b", layerId, "node_c"),
          node("node_c", layerId, "node_a")
        ]
      })
    ).toEqual([["node_a", "node_b", "node_c"]]);
  });
});

describe("serialization, parsing, and versioning", () => {
  it("round-trips deterministically and supports pretty output", () => {
    const document = createTestDocument();
    const serialized = serializeDocumentJson(document, true);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    expect(serialized.json).toContain("\n  ");
    const parsed = parseDocumentJson(serialized.json);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.document).toEqual(document);
  });

  it("rejects malformed JSON and unsupported future versions", () => {
    expect(parseDocumentJson("{").success).toBe(false);
    const result = parseDocument({ ...createTestDocument(), schemaVersion: "2.0.0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.code).toBe("DOCUMENT_VERSION_UNSUPPORTED");
  });

  it("parses and compares semantic versions", () => {
    expect(parseSchemaVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSchemaVersion("01.2.3")).toBeUndefined();
    expect(compareSchemaVersions("0.9.0", "1.0.0")).toBe(-1);
    expect(compareSchemaVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareSchemaVersions("1.1.0", "1.0.0")).toBe(1);
  });

  it("resolves deterministic synthetic migration paths and rejects duplicates", () => {
    const registry = new MigrationRegistry();
    const migration = (fromVersion: string, toVersion: string): DocumentMigration => ({
      fromVersion,
      toVersion,
      migrate: (value) => ({ value, fromVersion, toVersion, issues: [] })
    });
    registry.register(migration("0.8.0", "0.9.0"));
    registry.register(migration("0.9.0", "1.0.0"));
    expect(registry.resolvePath("0.8.0", "1.0.0")).toHaveLength(2);
    expect(registry.resolvePath("1.0.0", "1.0.0")).toEqual([]);
    expect(() => {
      registry.register(migration("0.9.0", "1.0.0"));
    }).toThrow("already registered");
    expect(() => {
      registry.resolvePath("0.7.0", "1.0.0");
    }).toThrow("No migration path");
  });
});
