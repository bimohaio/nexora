// @vitest-environment happy-dom

import { resolveEntityMetadata } from "@web-scada/renderer-svg";
import { describe, expect, it } from "vitest";

import { DESIGNER_SAMPLE_DOCUMENT } from "./sample-document.js";
import { DesignerOverlay } from "./overlay.js";

describe("DesignerOverlay", () => {
  it("makes the full selection frame resolve to its selected node", () => {
    const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const overlay = new DesignerOverlay(root);

    overlay.render({
      document: DESIGNER_SAMPLE_DOCUMENT,
      selection: {
        selectedNodeIds: ["node_pump"],
        selectedConnectionIds: []
      },
      viewport: DESIGNER_SAMPLE_DOCUMENT.canvas.defaultViewport,
      activeTool: "select",
      hover: {},
      interaction: { type: "idle" },
      guides: [],
      canUndo: false,
      canRedo: false
    });

    const frame = root.querySelector<SVGRectElement>(".selection-outline");
    expect(frame).not.toBeNull();
    expect(frame?.classList.contains("selection-outline-interactive")).toBe(true);
    expect(resolveEntityMetadata(frame)).toEqual({
      entityType: "node",
      entityId: "node_pump",
      nodeId: "node_pump"
    });
  });
});
