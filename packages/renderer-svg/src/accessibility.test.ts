// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { AccessibilityState } from "@web-scada/interaction-engine";
import type { SvgRenderer } from "./contracts.js";
import { SvgAccessibilityAdapter, SvgLiveRegionAdapter } from "./accessibility.js";

describe("SVG accessibility adapters", () => {
  it("applies semantic metadata, preferences, focus, and live announcements", () => {
    const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.append(node);
    const renderer = {
      getElementForNode: (id: string) => (id === "node" ? node : undefined),
      getElementForConnection: () => undefined,
      getSvgElement: () => root
    } as unknown as SvgRenderer;
    const state = {
      tree: {
        roots: ["root"],
        nodes: new Map([
          [
            "node",
            {
              id: "node",
              parent: "root",
              children: [],
              role: "graphics-symbol",
              label: "Pump",
              state: { selected: true },
              properties: {},
              visible: true,
              focusable: true
            }
          ]
        ]),
        revision: 1
      },
      focus: { target: { id: "node", kind: "node" }, order: ["node:node"], revision: 1 },
      aria: new Map([
        [
          "node",
          {
            role: "graphics-symbol",
            "aria-label": "Pump",
            "aria-selected": true,
            tabindex: 0
          }
        ]
      ]),
      preferences: { highContrast: true, prefersReducedMotion: true },
      visualTokens: {
        highContrast: true,
        focusOutlineVisible: true,
        selectionOutlineVisible: true,
        focusToken: "CanvasText",
        selectionToken: "Highlight",
        backgroundToken: "Canvas"
      },
      revision: 1
    } satisfies AccessibilityState;
    const adapter = new SvgAccessibilityAdapter(renderer);
    adapter.updateAccessibility(state);
    expect(node.getAttribute("role")).toBe("graphics-symbol");
    expect(node.getAttribute("aria-label")).toBe("Pump");
    expect(node.hasAttribute("data-accessibility-focused")).toBe(true);
    expect(root.hasAttribute("data-high-contrast")).toBe(true);
    expect(root.hasAttribute("data-reduced-motion")).toBe(true);

    const container = document.createElement("div");
    const live = new SvgLiveRegionAdapter(container);
    live.deliver({
      id: "announcement",
      message: "Pump selected",
      kind: "selection",
      politeness: "polite",
      priority: 0,
      timestamp: 1
    });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("Pump selected");
    live.clear();
    expect(container.children).toHaveLength(0);
  });
});
