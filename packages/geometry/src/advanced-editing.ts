import {
  boundsToRectangle,
  getRectangleCenter,
  normalizeRotation,
  rectangleToBounds,
  rotatePointAroundCenter,
  unionBounds
} from "./geometry.js";
import type { Point, Rectangle, Transform } from "./types.js";

export interface AngleSnapResult {
  readonly rawAngle: number;
  readonly angle: number;
  readonly delta: number;
  readonly snapped: boolean;
}

export function snapAngle(
  angle: number,
  increment = 15,
  tolerance = 4,
  enabled = true
): AngleSnapResult {
  const rawAngle = normalizeRotation(angle);
  if (!enabled) return { rawAngle, angle: rawAngle, delta: 0, snapped: false };
  if (!Number.isFinite(increment) || increment <= 0)
    throw new RangeError("Angle snap increment must be positive.");
  const candidate = normalizeRotation(Math.round(rawAngle / increment) * increment);
  let delta = candidate - rawAngle;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return Math.abs(delta) <= tolerance
    ? { rawAngle, angle: candidate, delta, snapped: true }
    : { rawAngle, angle: rawAngle, delta: 0, snapped: false };
}

export function angleFromCenter(center: Point, point: Point): number {
  return normalizeRotation((Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI);
}

export function rotatedBounds(transform: Transform): Rectangle {
  const center = getRectangleCenter(transform);
  const points = [
    { x: transform.x, y: transform.y },
    { x: transform.x + transform.width, y: transform.y },
    { x: transform.x + transform.width, y: transform.y + transform.height },
    { x: transform.x, y: transform.y + transform.height }
  ].map((point) => rotatePointAroundCenter(point, center, transform.rotation));
  return boundsToRectangle({
    left: Math.min(...points.map(({ x }) => x)),
    top: Math.min(...points.map(({ y }) => y)),
    right: Math.max(...points.map(({ x }) => x)),
    bottom: Math.max(...points.map(({ y }) => y))
  });
}

export function rotateTransforms(
  transforms: readonly Transform[],
  angleDelta: number,
  pivot?: Point
): readonly Transform[] {
  const first = transforms[0];
  if (first === undefined) return [];
  const selectionBounds = unionBounds(
    ...transforms.map((transform) => rectangleToBounds(rotatedBounds(transform)))
  );
  const origin =
    pivot ?? getRectangleCenter(boundsToRectangle(selectionBounds ?? rectangleToBounds(first)));
  return transforms.map((transform) => {
    const center = rotatePointAroundCenter(getRectangleCenter(transform), origin, angleDelta);
    return {
      ...transform,
      x: center.x - transform.width / 2,
      y: center.y - transform.height / 2,
      rotation: normalizeRotation(transform.rotation + angleDelta)
    };
  });
}

export type Alignment =
  "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";

export function alignRectangles(
  rectangles: readonly Rectangle[],
  alignment: Alignment,
  reference?: Rectangle
): readonly Point[] {
  if (rectangles.length === 0) return [];
  const selectionBounds = unionBounds(...rectangles.map(rectangleToBounds));
  if (selectionBounds === undefined) return [];
  const bounds = reference ?? boundsToRectangle(selectionBounds);
  return rectangles.map((rectangle) => {
    let x = rectangle.x;
    let y = rectangle.y;
    if (alignment === "left") x = bounds.x;
    else if (alignment === "horizontal-center") x = bounds.x + (bounds.width - rectangle.width) / 2;
    else if (alignment === "right") x = bounds.x + bounds.width - rectangle.width;
    else if (alignment === "top") y = bounds.y;
    else if (alignment === "vertical-center") y = bounds.y + (bounds.height - rectangle.height) / 2;
    else y = bounds.y + bounds.height - rectangle.height;
    return { x, y };
  });
}

export interface DistributionResult {
  readonly positions: readonly Point[];
  readonly orderedIndexes: readonly number[];
  readonly totalSpan: number;
  readonly totalOccupied: number;
  readonly spacing: number;
}

export function distributeRectangles(
  rectangles: readonly Rectangle[],
  axis: "horizontal" | "vertical"
): DistributionResult {
  const horizontal = axis === "horizontal";
  const orderedIndexes = [...rectangles.keys()].sort((left, right) => {
    const leftRectangle = rectangles[left];
    const rightRectangle = rectangles[right];
    if (leftRectangle === undefined || rightRectangle === undefined) return left - right;
    const difference =
      (horizontal ? leftRectangle.x : leftRectangle.y) -
      (horizontal ? rightRectangle.x : rightRectangle.y);
    return difference || left - right;
  });
  const first = rectangles[orderedIndexes[0] ?? -1];
  const last = rectangles[orderedIndexes.at(-1) ?? -1];
  if (rectangles.length < 3 || first === undefined || last === undefined)
    return {
      positions: rectangles.map(({ x, y }) => ({ x, y })),
      orderedIndexes,
      totalSpan: 0,
      totalOccupied: 0,
      spacing: 0
    };
  const size = (rectangle: Rectangle): number => (horizontal ? rectangle.width : rectangle.height);
  const coordinate = (rectangle: Rectangle): number => (horizontal ? rectangle.x : rectangle.y);
  const totalSpan = coordinate(last) + size(last) - coordinate(first);
  const totalOccupied = rectangles.reduce((sum, rectangle) => sum + size(rectangle), 0);
  const spacing = (totalSpan - totalOccupied) / (rectangles.length - 1);
  const positions = rectangles.map(({ x, y }) => ({ x, y }));
  let cursor = coordinate(first);
  for (const index of orderedIndexes) {
    const rectangle = rectangles[index];
    if (rectangle === undefined) continue;
    positions[index] = horizontal ? { x: cursor, y: rectangle.y } : { x: rectangle.x, y: cursor };
    cursor += size(rectangle) + spacing;
  }
  return { positions, orderedIndexes, totalSpan, totalOccupied, spacing };
}

export function normalizeRoute(points: readonly Point[]): readonly Point[] {
  const finite = points.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  const unique = finite.filter(
    (point, index) =>
      index === 0 || point.x !== finite[index - 1]?.x || point.y !== finite[index - 1]?.y
  );
  return unique.filter((point, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    if (previous === undefined || next === undefined) return true;
    return (
      (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x)
    );
  });
}

export function projectPointToSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { ...start };
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return { x: start.x + dx * ratio, y: start.y + dy * ratio };
}
