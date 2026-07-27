import { describe, expect, it, vi } from "vitest";
import { generateAriaMetadata } from "../aria/index.js";
import { AccessibilityDiagnostics } from "../diagnostics/accessibility-diagnostics.js";
import { AccessibilityFocusManager } from "../focus/accessibility-focus.js";
import { FocusEngine } from "../focus/index.js";
import { computeAccessibleName } from "../labels/index.js";
import { AnnouncementQueue } from "../announcements/index.js";
import { CustomAccessibilityPolicy } from "../policies/accessibility-policies.js";
import { AccessibilityRoleRegistry } from "../roles/index.js";
import { AccessibilityTree } from "../tree/index.js";
import type { AccessibilityNode } from "../types/accessibility.js";
import { AccessibilityEngine } from "./index.js";

const root: AccessibilityNode = {
  id: "root",
  children: ["node"],
  role: "graphics-document",
  label: "Process",
  state: {},
  properties: { targetKind: "canvas" },
  visible: true,
  focusable: true
};
const node: AccessibilityNode = {
  id: "node",
  parent: "root",
  children: [],
  role: "graphics-symbol",
  label: "Feed pump",
  description: "Centrifugal pump",
  state: { selected: true, expanded: false },
  properties: { targetKind: "node" },
  visible: true,
  focusable: true
};

describe("accessibility foundation", () => {
  it("builds immutable incremental trees and reuses unchanged nodes", () => {
    const tree = new AccessibilityTree();
    const first = tree.replace([root, node]);
    const originalNode = first.state.nodes.get("node");
    const second = tree.replace([root, node]);
    expect(second.changedIds).toEqual([]);
    expect(second.state.nodes.get("node")).toBe(originalNode);
    const changed = tree.update({
      upsert: [{ ...node, label: "Main feed pump" }]
    });
    expect(changed.changedIds).toEqual(["node"]);
    expect(Object.isFrozen(changed.state.nodes.get("node"))).toBe(true);
  });

  it("computes names and ARIA metadata deterministically", () => {
    expect(
      computeAccessibleName({
        symbolMetadata: { displayName: "Valve" },
        pluginMetadata: { label: "Plugin valve" },
        fallbackName: "Fallback"
      })
    ).toBe("Valve");
    expect(generateAriaMetadata(node)).toEqual({
      role: "graphics-symbol",
      "aria-label": "Feed pump",
      "aria-describedby": "Centrifugal pump",
      "aria-selected": true,
      "aria-expanded": false,
      tabindex: 0
    });
  });

  it("orders, deduplicates, and cancels live announcements", () => {
    const queue = new AnnouncementQueue();
    const polite = queue.enqueue({ message: "Saved", timestamp: 1 });
    const duplicate = queue.enqueue({ message: "Saved", timestamp: 2 });
    const error = queue.enqueue({ message: "Connection lost", kind: "error", timestamp: 3 });
    expect(duplicate).toBeUndefined();
    expect(queue.next()).toBe(error);
    expect(queue.cancel(polite?.id ?? "")).toBe(true);
    expect(queue.size).toBe(0);
  });

  it("applies policies, synchronizes focus, renders preferences, and delivers announcements", () => {
    const deliver = vi.fn();
    const updateNodes = vi.fn();
    const updateAccessibility = vi.fn();
    const diagnostics = new AccessibilityDiagnostics(true);
    const focus = new FocusEngine();
    const engine = new AccessibilityEngine({
      focus: new AccessibilityFocusManager(focus),
      screenReader: { deliver, clear: vi.fn() },
      renderer: { updateNodes, updateAccessibility, clearAccessibility: vi.fn() },
      diagnostics,
      policies: [new CustomAccessibilityPolicy("exclude-x", ({ id }) => id !== "excluded")]
    });
    const state = engine.update([
      root,
      node,
      { ...node, id: "excluded", parent: "root", label: "Excluded" }
    ]);
    expect(state.tree.nodes.has("excluded")).toBe(false);
    expect(state.focus.order).toEqual(["canvas:root", "node:node"]);
    engine.setPreferences({ highContrast: true, prefersReducedMotion: true });
    expect(engine.state.visualTokens.focusToken).toBe("CanvasText");
    engine.announce({ message: "Feed pump selected", kind: "selection", timestamp: 1 });
    engine.flushAnnouncements();
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Feed pump selected", politeness: "polite" })
    );
    expect(updateNodes).toHaveBeenCalled();
    expect(updateAccessibility).toHaveBeenCalled();
    expect(diagnostics.snapshot().treeUpdates).toBe(1);
  });

  it("supports registered application roles", () => {
    const roles = new AccessibilityRoleRegistry();
    roles.register("scada-alarm");
    expect(roles.require("scada-alarm")).toBe("scada-alarm");
    expect(() => roles.require("unknown-role")).toThrow("Unknown role");
  });
});
