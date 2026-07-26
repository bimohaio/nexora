// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";
import { mountSymbolGallery } from "../../apps/symbol-gallery/src/symbol-gallery.js";

describe("industrial symbol gallery", () => {
  it("renders every registered symbol, states, ports, properties, and sizing", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const controller = mountSymbolGallery(root);
    const expected = createIndustrialSymbolRegistry().getAll().length;
    expect(root.querySelectorAll("article[data-symbol-type]")).toHaveLength(expected);
    expect(root.querySelectorAll("[data-category]").length).toBeGreaterThanOrEqual(6);
    expect(root.querySelectorAll("[data-scada-root]")).toHaveLength(expected);
    expect(root.textContent).toContain("editable properties");
    expect(root.textContent).toContain("Ports:");
    controller.setState("alarm");
    expect(root.querySelector(".scada-state-alarm")).not.toBeNull();
    controller.setMinimumSize(true);
    expect(root.querySelectorAll("[data-scada-symbol]")).toHaveLength(expected);
    controller.dispose();
    expect(root.childElementCount).toBe(0);
  });
});
