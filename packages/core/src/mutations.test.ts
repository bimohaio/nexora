import { describe, expect, it } from "vitest";

import {
  DeterministicIdGenerator,
  FixedClock,
  addConnection,
  addLayer,
  addNode,
  createEmptyChangeSet,
  mergeChangeSets,
  removeLayer,
  removeNode,
  reorderLayers,
  updateNode,
  validateDocumentSemantics,
  type ScadaConnection,
  type ScadaNode
} from "./index.js";
import { createTestDocument } from "./testing.test-helper.js";

const mutationOptions = {
  clock: new FixedClock("2026-01-02T00:00:00.000Z"),
  idGenerator: new DeterministicIdGenerator()
};

describe("immutable document mutations", () => {
  it("adds and updates a node while preserving the input", () => {
    const document = createTestDocument();
    const layerId = document.layers[0]?.id ?? "";
    const node: ScadaNode = {
      id: "node_a",
      name: "A",
      symbolType: "basic.rectangle",
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      properties: {},
      bindings: [],
      layerId,
      visible: true,
      locked: false
    };
    Object.freeze(document);
    const added = addNode(document, node, mutationOptions);
    expect(added.success).toBe(true);
    if (!added.success) return;
    expect(document.nodes).toHaveLength(0);
    expect(added.changes.addedNodeIds).toEqual(["node_a"]);
    const updated = updateNode(
      added.document,
      "node_a",
      (current) => ({ ...current, name: "Updated" }),
      mutationOptions
    );
    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.changes.updatedNodeIds).toEqual(["node_a"]);
      expect(updated.document.nodes[0]?.name).toBe("Updated");
    }
  });

  it("removes a node, related connections, and reparents children", () => {
    const document = createTestDocument();
    const layerId = document.layers[0]?.id ?? "";
    const node = (id: string, parentId?: string): ScadaNode => ({
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
    const connection: ScadaConnection = {
      id: "conn_a",
      name: "A to B",
      source: { nodeId: "node_a", portId: "out" },
      target: { nodeId: "node_b", portId: "in" },
      routing: "direct",
      waypoints: [],
      medium: "generic",
      direction: "forward",
      style: {},
      layerId,
      visible: true,
      locked: false
    };
    const withEntities = {
      ...document,
      nodes: [node("node_a"), node("node_b", "node_a")],
      connections: [connection]
    };
    const result = removeNode(withEntities, "node_a", mutationOptions);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.document.connections).toEqual([]);
    expect(result.document.nodes[0]?.parentId).toBeUndefined();
    expect(result.changes.removedConnectionIds).toEqual(["conn_a"]);
    expect(validateDocumentSemantics(result.document).valid).toBe(true);
  });

  it("validates additions atomically", () => {
    const document = createTestDocument();
    const connection: ScadaConnection = {
      id: "conn_invalid",
      name: "Invalid",
      source: { nodeId: "node_missing", portId: "out" },
      target: { nodeId: "node_other", portId: "in" },
      routing: "direct",
      waypoints: [],
      medium: "water",
      direction: "forward",
      style: {},
      layerId: document.layers[0]?.id ?? "",
      visible: true,
      locked: false
    };
    const result = addConnection(document, connection, mutationOptions);
    expect(result.success).toBe(false);
    expect(result.document).toBe(document);
  });

  it("enforces layer deletion and reordering rules", () => {
    const document = createTestDocument();
    expect(
      removeLayer(document, document.layers[0]?.id ?? "", undefined, mutationOptions).success
    ).toBe(false);
    const added = addLayer(
      document,
      { id: "layer_second", name: "Second", order: 1, visible: true, locked: false },
      mutationOptions
    );
    expect(added.success).toBe(true);
    if (!added.success) return;
    const reordered = reorderLayers(
      added.document,
      ["layer_second", document.layers[0]?.id ?? ""],
      mutationOptions
    );
    expect(reordered.success).toBe(true);
    if (reordered.success) expect(reordered.document.layers[0]?.id).toBe("layer_second");
  });
});

describe("change sets", () => {
  it("deduplicates IDs with removed overriding updated and added", () => {
    const merged = mergeChangeSets(
      { ...createEmptyChangeSet(), addedNodeIds: ["node_a"], updatedNodeIds: ["node_b"] },
      { ...createEmptyChangeSet(), removedNodeIds: ["node_a", "node_b"] }
    );
    expect(merged.addedNodeIds).toEqual([]);
    expect(merged.updatedNodeIds).toEqual([]);
    expect(merged.removedNodeIds).toEqual(["node_a", "node_b"]);
  });
});
