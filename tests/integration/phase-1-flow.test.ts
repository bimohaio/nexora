import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  DeterministicIdGenerator,
  FixedClock,
  parseDocumentJson,
  removeNode,
  serializeDocumentJson,
  updateNode,
  validateDocumentSemantics,
  type ScadaDocument,
  type ScadaNode
} from "@web-scada/core";
import { createExampleSymbolRegistry } from "@web-scada/symbols";

const exampleUrl = new URL(
  "../../examples/water-treatment/minimal-process.scada.json",
  import.meta.url
);
const json = readFileSync(exampleUrl, "utf8");

describe("Phase 1 integration flows", () => {
  it("imports, validates, serializes, and reparses the example document", () => {
    const registry = createExampleSymbolRegistry();
    const parsed = parseDocumentJson(json, { symbolRegistry: registry });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.document.nodes).toHaveLength(3);
    expect(validateDocumentSemantics(parsed.document, { symbolRegistry: registry }).valid).toBe(
      true
    );
    const serialized = serializeDocumentJson(parsed.document);
    expect(serialized.success).toBe(true);
    if (serialized.success)
      expect(parseDocumentJson(serialized.json, { symbolRegistry: registry }).success).toBe(true);
  });

  it("returns stable errors for malformed imports and future versions", () => {
    expect(parseDocumentJson('{"schemaVersion":"1.0.0"}').success).toBe(false);
    const future = JSON.parse(json) as Record<string, unknown>;
    future.schemaVersion = "2.0.0";
    const parsed = parseDocumentJson(JSON.stringify(future));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.issues[0]?.code).toBe("DOCUMENT_VERSION_UNSUPPORTED");
  });

  it("hands a focused immutable change set to future renderer consumers", () => {
    const parsed = parseDocumentJson(json);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const original = parsed.document;
    const result = updateNode(
      original,
      "node_pump",
      (node) => ({ ...node, transform: { ...node.transform, x: 520 } }),
      {
        clock: new FixedClock("2026-01-02T00:00:00.000Z"),
        idGenerator: new DeterministicIdGenerator()
      }
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.changes.updatedNodeIds).toEqual(["node_pump"]);
    expect(result.document.nodes.find(({ id }) => id === "node_tank")).toBe(
      original.nodes.find(({ id }) => id === "node_tank")
    );
  });

  it("removes connected nodes and reparents direct children", () => {
    const parsed = parseDocumentJson(json);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const template = parsed.document.nodes[1];
    expect(template).toBeDefined();
    if (template === undefined) return;
    const child: ScadaNode = {
      ...template,
      id: "node_child",
      parentId: "node_tank"
    };
    const document: ScadaDocument = {
      ...parsed.document,
      nodes: [...parsed.document.nodes, child]
    };
    const result = removeNode(document, "node_tank", {
      clock: new FixedClock("2026-01-02T00:00:00.000Z"),
      idGenerator: new DeterministicIdGenerator()
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.connections).toHaveLength(0);
      expect(result.document.nodes.find(({ id }) => id === "node_child")?.parentId).toBeUndefined();
    }
  });
});
