import type { NormalizedPoint, Point, Rectangle, Rotation, Size } from "./types.js";

export function isNormalizedPoint(point: Point): point is NormalizedPoint {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

export function calculatePortPosition(bounds: Rectangle, position: NormalizedPoint): Point {
  return {
    x: bounds.x + bounds.width * position.x,
    y: bounds.y + bounds.height * position.y
  };
}

export function snapValueToGrid(value: number, gridSize: number): number {
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    throw new RangeError("gridSize must be a positive finite number");
  }
  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(point: Point, gridSize: number): Point {
  return {
    x: snapValueToGrid(point.x, gridSize),
    y: snapValueToGrid(point.y, gridSize)
  };
}

export function normalizeRotation(rotation: number): Rotation {
  if (!Number.isFinite(rotation)) {
    throw new RangeError("rotation must be finite");
  }
  const normalized = ((rotation % 360) + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90;
  return (snapped === 360 ? 0 : snapped) as Rotation;
}

export function hasPositiveDimensions(size: Size): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}
