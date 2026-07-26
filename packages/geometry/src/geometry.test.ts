import { describe, expect, it } from "vitest";

import {
  calculatePortPosition,
  hasPositiveDimensions,
  isNormalizedPoint,
  normalizeRotation,
  snapPointToGrid,
  snapValueToGrid
} from "./index.js";

describe("geometry foundations", () => {
  it("calculates a port position in logical coordinates", () => {
    expect(
      calculatePortPosition({ x: 100, y: 20, width: 200, height: 80 }, { x: 1, y: 0.5 })
    ).toEqual({ x: 300, y: 60 });
  });

  it("validates normalized points", () => {
    expect(isNormalizedPoint({ x: 0, y: 1 })).toBe(true);
    expect(isNormalizedPoint({ x: 1.01, y: 0.5 })).toBe(false);
  });

  it("snaps values and points to a grid", () => {
    expect(snapValueToGrid(14, 10)).toBe(10);
    expect(snapPointToGrid({ x: 16, y: 24 }, 10)).toEqual({ x: 20, y: 20 });
    expect(() => snapValueToGrid(1, 0)).toThrow(RangeError);
  });

  it("normalizes rotations to the nearest supported quarter turn", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(359)).toBe(0);
    expect(normalizeRotation(135)).toBe(180);
  });

  it("accepts only finite positive dimensions", () => {
    expect(hasPositiveDimensions({ width: 1, height: 2 })).toBe(true);
    expect(hasPositiveDimensions({ width: 0, height: 2 })).toBe(false);
    expect(hasPositiveDimensions({ width: Number.NaN, height: 2 })).toBe(false);
  });
});
