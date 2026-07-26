import { describe, expect, it } from "vitest";

import {
  createDirectConnectionPoints,
  createGridConfiguration,
  createManualConnectionPoints,
  createNodeTransform,
  createOrthogonalConnectionPoints,
  createPathData,
  fitRectangleToViewport,
  normalizeRenderChangeSet,
  runtimeStateClass,
  zoomViewportAtPoint
} from "./index.js";

describe("SVG rendering calculations", () => {
  it("creates a predictable node transform", () => {
    expect(
      createNodeTransform({
        x: 10,
        y: 20,
        width: 100,
        height: 60,
        rotation: 90,
        scaleX: 2,
        scaleY: 1
      })
    ).toBe("translate(10 20) rotate(90 50 30) scale(2 1)");
  });

  it("creates direct, manual, and deterministic midpoint orthogonal routes", () => {
    const source = { x: 0, y: 10 };
    const target = { x: 100, y: 60 };
    expect(createDirectConnectionPoints(source, target)).toEqual([source, target]);
    expect(createManualConnectionPoints(source, [{ x: 20, y: 30 }], target)).toEqual([
      source,
      { x: 20, y: 30 },
      target
    ]);
    expect(createOrthogonalConnectionPoints(source, target)).toEqual([
      source,
      { x: 50, y: 10 },
      { x: 50, y: 60 },
      target
    ]);
    expect(createPathData([source, target])).toBe("M 0 10 L 100 60");
  });

  it("zooms around an anchor and clamps zoom", () => {
    expect(zoomViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 50 })).toEqual({
      x: -100,
      y: -50,
      zoom: 2
    });
    expect(zoomViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }).zoom).toBe(8);
  });

  it("fits content with padding and centers it", () => {
    expect(
      fitRectangleToViewport(
        { x: 0, y: 0, width: 1000, height: 500 },
        { width: 1200, height: 800 },
        100
      )
    ).toEqual({ x: 100, y: 150, zoom: 1 });
  });

  it("creates all grid configurations", () => {
    expect(createGridConfiguration("lines", 20).pathData).toBe("M 20 0 L 0 0 0 20");
    expect(createGridConfiguration("dots", 20).dot).toEqual({ x: 1, y: 1 });
    expect(createGridConfiguration("cross", 20).pathData).toContain("h 4");
    expect(() => createGridConfiguration("lines", 0)).toThrow(RangeError);
  });

  it("normalizes change sets and runtime state classes", () => {
    const changes = normalizeRenderChangeSet({
      addedNodeIds: ["node_b", "node_a", "node_a"],
      canvasChanged: true
    });
    expect(changes.addedNodeIds).toEqual(["node_a", "node_b"]);
    expect(changes.removedNodeIds).toEqual([]);
    expect(changes.canvasChanged).toBe(true);
    expect(runtimeStateClass("alarm")).toBe("scada-state-alarm");
  });
});
