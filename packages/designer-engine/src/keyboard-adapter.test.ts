import { describe, expect, it, vi } from "vitest";
import type { DesignerController } from "./contracts.js";
import { createDesignerKeyboardEngine, designerFocusTargets } from "./keyboard-adapter.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

describe("designer keyboard adapter", () => {
  it("builds document-order targets and synchronizes focus with selection", () => {
    const document = createDesignerTestDocument(2);
    const selectNode = vi.fn();
    const clearSelection = vi.fn();
    const designer = {
      getState: () => ({
        document,
        selection: { selectedNodeIds: [], selectedConnectionIds: [] },
        viewport: document.canvas.defaultViewport
      }),
      selectNode,
      selectConnection: vi.fn(),
      clearSelection,
      setInteraction: vi.fn()
    } as unknown as DesignerController;
    expect(designerFocusTargets(designer).map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      `canvas:${document.id}`,
      "layer:layer",
      "node:node_0",
      "node:node_1"
    ]);
    const engine = createDesignerKeyboardEngine({ designer });
    engine.process({ type: "key-down", key: "Home", timestamp: 1 });
    engine.process({ type: "key-down", key: "Tab", timestamp: 2 });
    engine.process({ type: "key-down", key: "Tab", timestamp: 3 });
    expect(selectNode).toHaveBeenCalledWith("node_0", "replace");
    engine.process({ type: "key-down", key: "Escape", timestamp: 4 });
    expect(clearSelection).toHaveBeenCalled();
  });
});
