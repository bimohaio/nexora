import { describe, expect, it } from "vitest";
import type { Command, ScadaDocument } from "@web-scada/core";
import type { PointerState } from "@web-scada/interaction-engine";
import { deriveDocumentChangeSet } from "./change-set.js";
import { createDesignerDragEngine } from "./drag-adapter.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

function pointer(x: number, y: number): PointerState {
  const point = { x, y };
  return {
    id: 1,
    type: "mouse",
    position: point,
    movement: { x: 0, y: 0 },
    buttons: 1,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    modifiers: {
      shift: false,
      control: false,
      alt: false,
      meta: false,
      capsLock: false,
      numLock: false,
      scrollLock: false
    },
    timestamp: 0,
    primary: true,
    coordinates: { screen: point, viewport: point, canvas: point, world: point }
  };
}

describe("designer drag adapter", () => {
  it("does not mutate during preview and commits through MoveNodesCommand", () => {
    const original = createDesignerTestDocument(1);
    const originalNode = original.nodes[0];
    if (originalNode === undefined) throw new Error("Expected a test node.");
    const nodeId = originalNode.id;
    let document: ScadaDocument = original;
    const engine = createDesignerDragEngine({
      getDocument: () => document,
      minimumMovement: 0
    });
    engine.start({ pointer: pointer(5, 5), draggedIds: [nodeId] });
    engine.update(pointer(15, 25));
    expect(document).toBe(original);
    const result = engine.commit();
    expect(result.command?.type).toBe("move-node");
    document = (result.command as Command).execute({ document }).document;
    const movedNode = document.nodes[0];
    expect(movedNode?.transform.x).toBe(originalNode.transform.x + 10);
    expect(movedNode?.transform.y).toBe(originalNode.transform.y + 20);
    expect(deriveDocumentChangeSet(original, document).updatedNodeIds).toEqual([nodeId]);
  });
});
