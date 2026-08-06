// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  SvgConnectionFlowAdapter,
  type RendererConnectionFlowSample
} from "./connection-flow-adapter.js";

const ns = "http://www.w3.org/2000/svg";
const sample = (
  overrides: Partial<RendererConnectionFlowSample> = {}
): RendererConnectionFlowSample => ({
  connectionId: "connection-1",
  animationId: "flow",
  mode: "dash",
  phase: 0.5,
  progress: 0.5,
  direction: "forward",
  speed: 1,
  intensity: 1,
  opacity: 0.8,
  color: "#00ff00",
  dashLength: 8,
  gapLength: 2,
  markerCount: 2,
  markerSpacing: 0.5,
  markerSize: 4,
  orientMarkers: true,
  quality: "good",
  alarm: "none",
  visible: true,
  reducedMotion: false,
  revision: 1,
  ...overrides
});

function fixture(): {
  svg: SVGSVGElement;
  base: SVGPathElement;
  hit: SVGPathElement;
  adapter: SvgConnectionFlowAdapter;
} {
  const svg = document.createElementNS(ns, "svg");
  const base = document.createElementNS(ns, "path");
  const hit = document.createElementNS(ns, "path");
  base.setAttribute("d", "M 0 0 L 100 0 L 100 100");
  base.setAttribute("stroke", "blue");
  base.setAttribute("stroke-width", "3");
  hit.dataset.hitArea = "true";
  hit.setAttribute("stroke-width", "12");
  svg.append(base, hit);
  document.body.append(svg);
  const adapter = new SvgConnectionFlowAdapter({ getElementForConnection: () => base });
  return { svg, base, hit, adapter };
}

describe("SvgConnectionFlowAdapter", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("applies deterministic dash flow on an overlay and preserves base/hit paths", () => {
    const { base, hit, adapter } = fixture();
    adapter.applySample(sample());
    const overlay = base.nextElementSibling as SVGPathElement;
    expect(overlay.dataset.scadaConnectionFlow).toBe("connection-1");
    expect(overlay.getAttribute("pointer-events")).toBe("none");
    expect(overlay.getAttribute("stroke-dasharray")).toBe("8 2");
    expect(overlay.getAttribute("stroke-dashoffset")).toBe("-5");
    expect(base.getAttribute("stroke")).toBe("blue");
    expect(hit.getAttribute("stroke-width")).toBe("12");
    adapter.applySample(sample({ direction: "reverse" }));
    expect(overlay.getAttribute("stroke-dashoffset")).toBe("5");
  });

  it("pools markers, caches geometry and invalidates only after reroute", () => {
    const { base, adapter } = fixture();
    adapter.applySample(sample({ mode: "marker", markerCount: 3 }));
    const group = base.parentElement?.querySelector("[data-scada-connection-flow-markers]");
    expect(group?.childElementCount).toBe(3);
    const first = group?.firstElementChild;
    adapter.applySample(sample({ mode: "marker", markerCount: 1, phase: 0.7 }));
    expect(group?.childElementCount).toBe(3);
    expect(group?.firstElementChild).toBe(first);
    expect(adapter.debugSnapshot()[0]?.pathLength).toBe(200);
    base.setAttribute("d", "M 0 0 L 50 0");
    adapter.applySample(sample({ mode: "marker", markerCount: 1 }));
    expect(adapter.debugSnapshot()[0]?.pathLength).toBe(50);
  });

  it("deduplicates batches, clamps marker growth and disposes generated DOM", () => {
    const { base, adapter } = fixture();
    adapter.enqueue(sample({ phase: 0.1 }));
    adapter.enqueue(sample({ phase: 0.2 }));
    expect(adapter.pendingCount).toBe(1);
    adapter.commit();
    adapter.applySample(sample({ mode: "marker", markerCount: 100 }));
    expect(
      base.parentElement?.querySelector("[data-scada-connection-flow-markers]")?.childElementCount
    ).toBe(64);
    expect(adapter.diagnostics.at(-1)?.code).toBe("CONNECTION_FLOW_MARKER_LIMIT_EXCEEDED");
    adapter.dispose();
    expect(adapter.cacheSize).toBe(0);
    expect(base.parentElement?.querySelector("[data-scada-connection-flow]")).toBeNull();
    expect(base.parentElement?.querySelector("[data-scada-connection-flow-markers]")).toBeNull();
  });
});
