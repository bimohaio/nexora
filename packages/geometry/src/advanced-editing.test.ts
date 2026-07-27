import { describe, expect, it } from "vitest";

import {
  alignRectangles,
  distributeRectangles,
  normalizeRoute,
  projectPointToSegment,
  rotateTransforms,
  rotatedBounds,
  snapAngle
} from "./index.js";

describe("advanced editing geometry", () => {
  it("normalizes and snaps angles deterministically", () => {
    expect(snapAngle(-2, 15, 4)).toMatchObject({ rawAngle: 358, angle: 0, snapped: true });
    expect(snapAngle(8, 15, 4)).toMatchObject({ angle: 8, snapped: false });
  });

  it("calculates rotated bounds and shared-pivot transforms", () => {
    const transform = { x: 0, y: 0, width: 100, height: 50, rotation: 90, scaleX: 1, scaleY: 1 };
    const bounds = rotatedBounds(transform);
    expect(bounds.x).toBeCloseTo(25);
    expect(bounds).toMatchObject({ y: -25, width: 50, height: 100 });
    const rotated = rotateTransforms([transform, { ...transform, x: 200, rotation: 0 }], 180, {
      x: 150,
      y: 25
    });
    expect(rotated[0]).toMatchObject({ x: 200, y: 0, rotation: 270 });
    expect(rotated[1]).toMatchObject({ x: 0, y: 0, rotation: 180 });
  });

  it("aligns mixed rectangles and distributes equal gaps independent of input order", () => {
    const rectangles = [
      { x: 100, y: 20, width: 20, height: 20 },
      { x: 0, y: 10, width: 10, height: 10 },
      { x: 50, y: 0, width: 30, height: 30 }
    ];
    expect(alignRectangles(rectangles, "top").map(({ y }) => y)).toEqual([0, 0, 0]);
    const result = distributeRectangles(rectangles, "horizontal");
    expect(result.orderedIndexes).toEqual([1, 2, 0]);
    expect(result.spacing).toBe(30);
    expect(result.positions.map(({ x }) => x)).toEqual([100, 0, 40]);
  });

  it("normalizes routes and projects waypoints", () => {
    expect(
      normalizeRoute([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 }
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 }
    ]);
    expect(projectPointToSegment({ x: 4, y: 8 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 4,
      y: 0
    });
  });
});
