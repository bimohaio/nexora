import { describe, expect, it, vi } from "vitest";
import type { DesignerController } from "./contracts.js";
import {
  createDesignerAccessibilityEngine,
  designerAccessibilityNodes
} from "./accessibility-adapter.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

describe("designer accessibility adapter", () => {
  it("creates semantic document nodes and an operational engine", () => {
    const document = createDesignerTestDocument(2);
    const designer = {
      getState: () => ({
        document,
        selection: { selectedNodeIds: ["node_0"], selectedConnectionIds: [] },
        viewport: document.canvas.defaultViewport
      })
    } as unknown as DesignerController;
    const nodes = designerAccessibilityNodes(designer);
    expect(nodes.map(({ role }) => role)).toEqual([
      "graphics-document",
      "group",
      "graphics-symbol",
      "graphics-symbol"
    ]);
    expect(nodes.find(({ id }) => id === "node_0")?.state.selected).toBe(true);
    const engine = createDesignerAccessibilityEngine({
      designer,
      screenReader: { deliver: vi.fn(), clear: vi.fn() }
    });
    expect(engine.state.tree.nodes.size).toBe(4);
    expect(engine.state.aria.get("node_0")?.["aria-label"]).toBe("Node 0");
  });
});
