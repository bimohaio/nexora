import { describe, expect, it } from "vitest";

import {
  calculatePortPosition,
  canvasPointToViewport,
  clampZoom,
  containsPoint,
  expandBounds,
  hasPositiveDimensions,
  intersectsRectangle,
  isFinitePoint,
  isFiniteTransform,
  isNormalizedPoint,
  normalizeRotation,
  rectangleToBounds,
  rotatePointAroundCenter,
  snapPointToGrid,
  snapRectangleToGrid,
  snapValueToGrid
} from "./index.js";

describe("geometry foundations", () => {
  it("calculates a port position in logical coordinates", () => {
    expect(
      calculatePortPosition({ x: 100, y: 20, width: 200, height: 80 }, { x: 1, y: 0.5 })
    ).toEqual({ x: 300, y: 60 });
  });

  it("validates normalized points and positive dimensions", () => {
    expect(isNormalizedPoint({ x: 0, y: 1 })).toBe(true);
    expect(isNormalizedPoint({ x: 1.01, y: 0.5 })).toBe(false);
    expect(hasPositiveDimensions({ width: 1, height: 2 })).toBe(true);
    expect(hasPositiveDimensions({ width: 0, height: 2 })).toBe(false);
  });

  it("snaps values, points, and rectangles using explicit policies", () => {
    expect(snapValueToGrid(14, 10)).toBe(10);
    expect(snapPointToGrid({ x: 16, y: 24 }, 10)).toEqual({ x: 20, y: 20 });
    expect(snapValueToGrid(-14, 10)).toBe(-10);
    expect(snapValueToGrid(15, 10, "floor")).toBe(10);
    expect(snapRectangleToGrid({ x: 9, y: 11, width: 19, height: 21 }, 10)).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20
    });
    expect(snapValueToGrid(13, 10, "nearest", false)).toBe(13);
    expect(() => snapValueToGrid(1, 0)).toThrow(RangeError);
  });

  it("normalizes general rotations", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(359)).toBe(359);
    expect(normalizeRotation(450)).toBe(90);
  });

  it("calculates transformed port positions around the node center", () => {
    const transform = {
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      rotation: 90,
      scaleX: 2,
      scaleY: 1
    };
    expect(calculatePortPosition(transform, { x: 1, y: 0.5 })).toEqual({ x: 150, y: 225 });
    expect(rotatePointAroundCenter({ x: 2, y: 1 }, { x: 1, y: 1 }, 180)).toEqual({
      x: 0,
      y: 1
    });
  });

  it("handles rectangles, bounds, intersections, and containment", () => {
    const rectangle = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangleToBounds(rectangle)).toEqual({ left: 0, top: 0, right: 10, bottom: 10 });
    expect(containsPoint(rectangle, { x: 10, y: 10 })).toBe(true);
    expect(intersectsRectangle(rectangle, { x: 9, y: 9, width: 2, height: 2 })).toBe(true);
    expect(expandBounds(rectangleToBounds(rectangle), 2)).toEqual({
      left: -2,
      top: -2,
      right: 12,
      bottom: 12
    });
  });

  it("validates finite geometry and converts viewport points", () => {
    expect(isFinitePoint({ x: Number.POSITIVE_INFINITY, y: 0 })).toBe(false);
    expect(
      isFiniteTransform({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        scaleX: 0,
        scaleY: 1
      })
    ).toBe(false);
    expect(canvasPointToViewport({ x: 10, y: 5 }, { x: 2, y: 3, zoom: 2 })).toEqual({
      x: 22,
      y: 13
    });
    expect(clampZoom(10, 0.1, 8)).toBe(8);
  });
});
