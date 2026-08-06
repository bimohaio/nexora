// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SvgSymbolAnimationAdapter, TransformComposer } from "./symbol-animation-adapter.js";

const svgNamespace = "http://www.w3.org/2000/svg";

describe("SVG symbol animation adapter", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("caches render parts, preserves identity and composes with the base transform", () => {
    const svg = document.createElementNS(svgNamespace, "svg");
    const node = document.createElementNS(svgNamespace, "g");
    const visual = document.createElementNS(svgNamespace, "g");
    visual.dataset.scadaSymbol = "";
    visual.setAttribute("transform", "translate(10 20)");
    node.append(visual);
    svg.append(node);
    document.body.append(svg);
    const lookup = vi.fn(() => node);
    const adapter = new SvgSymbolAnimationAdapter({ getElementForNode: lookup });
    const sample = {
      entityId: "motor",
      slotId: "motion",
      target: { part: "root", property: "rotation" },
      value: 90
    };
    adapter.applySamples("motor", [sample]);
    adapter.applySamples("motor", [{ ...sample, value: 180 }]);
    expect(lookup).toHaveBeenCalledOnce();
    expect(adapter.cachedTargetCount).toBe(1);
    expect(node.firstElementChild).toBe(visual);
    expect(visual.getAttribute("transform")).toBe("translate(10 20) rotate(180)");
    adapter.remove("motor");
    expect(visual.getAttribute("transform")).toBe("translate(10 20)");
  });

  it("applies batched semantic properties and restores base attributes", () => {
    const node = document.createElementNS(svgNamespace, "g");
    node.dataset.scadaSymbol = "";
    node.setAttribute("opacity", "0.8");
    document.body.append(node);
    const adapter = new SvgSymbolAnimationAdapter({ getElementForNode: () => node });
    adapter.applySamples("lamp", [
      {
        entityId: "lamp",
        slotId: "indicator",
        target: { part: "root", property: "opacity" },
        value: 0.4
      },
      {
        entityId: "lamp",
        slotId: "color",
        target: { part: "root", property: "fill" },
        value: { r: 255, g: 0, b: 0, a: 1 }
      }
    ]);
    expect(node.getAttribute("opacity")).toBe("0.4");
    expect(node.getAttribute("fill")).toBe("rgba(255, 0, 0, 1)");
    adapter.applySamples("lamp", []);
    expect(node.getAttribute("opacity")).toBe("0.8");
    expect(node.hasAttribute("fill")).toBe(false);
  });

  it("isolates missing targets and renderer failures with typed diagnostics", () => {
    const node = document.createElementNS(svgNamespace, "g");
    const diagnostics: string[] = [];
    const adapter = new SvgSymbolAnimationAdapter(
      { getElementForNode: () => node },
      { onDiagnostic: ({ code }) => diagnostics.push(code) }
    );
    adapter.applySamples("pump", [
      {
        entityId: "pump",
        slotId: "missing",
        target: { part: "rotor", property: "rotation" },
        value: 1
      },
      {
        entityId: "pump",
        slotId: "invalid",
        target: { part: "root", property: "unsupported" },
        value: 1
      }
    ]);
    expect(diagnostics).toEqual(["ANIMATION_TARGET_NOT_FOUND", "ANIMATION_RENDERER_FAILED"]);
  });
});

describe("TransformComposer", () => {
  it("adopts a renderer-updated base transform before applying the next sample", () => {
    const element = document.createElementNS(svgNamespace, "g");
    const composer = new TransformComposer();
    element.setAttribute("transform", "translate(0 0)");
    composer.apply(element, 10, "rotation");
    element.setAttribute("transform", "translate(20 30)");
    composer.apply(element, 20, "rotation");
    expect(element.getAttribute("transform")).toBe("translate(20 30) rotate(20)");
  });
});
