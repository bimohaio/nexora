import type {
  Bounds,
  NormalizedPoint,
  Point,
  Rectangle,
  Rotation,
  Size,
  Transform,
  Viewport
} from "./types.js";

import type { Matrix } from "./types.js";

const cleanFloat = (value: number): number => (Math.abs(value) < 1e-12 ? 0 : value);

export function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function isNormalizedPoint(point: Point): point is NormalizedPoint {
  return isFinitePoint(point) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function isPositiveSize(size: Size): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

export const hasPositiveDimensions = isPositiveSize;

export function isValidRectangle(rectangle: Rectangle): boolean {
  return isFinitePoint(rectangle) && isPositiveSize(rectangle);
}

export function isFiniteTransform(transform: Transform): boolean {
  return (
    isValidRectangle(transform) &&
    Number.isFinite(transform.rotation) &&
    Number.isFinite(transform.scaleX) &&
    Number.isFinite(transform.scaleY) &&
    transform.scaleX !== 0 &&
    transform.scaleY !== 0
  );
}

export function getRectangleCenter(rectangle: Rectangle): Point {
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
}

export function rotatePoint(point: Point, degrees: number): Point {
  if (!isFinitePoint(point) || !Number.isFinite(degrees))
    throw new RangeError("Point and rotation must be finite.");
  const radians = (degrees * Math.PI) / 180;
  return {
    x: cleanFloat(point.x * Math.cos(radians) - point.y * Math.sin(radians)),
    y: cleanFloat(point.x * Math.sin(radians) + point.y * Math.cos(radians))
  };
}

export function rotatePointAroundCenter(point: Point, center: Point, degrees: number): Point {
  const rotated = rotatePoint({ x: point.x - center.x, y: point.y - center.y }, degrees);
  return { x: cleanFloat(rotated.x + center.x), y: cleanFloat(rotated.y + center.y) };
}

export function calculatePortPosition(
  bounds: Rectangle | Transform,
  position: NormalizedPoint
): Point {
  const center = getRectangleCenter(bounds);
  const unscaled = {
    x: bounds.x + bounds.width * position.x,
    y: bounds.y + bounds.height * position.y
  };
  const scaleX = "scaleX" in bounds ? bounds.scaleX : 1;
  const scaleY = "scaleY" in bounds ? bounds.scaleY : 1;
  const scaled = {
    x: center.x + (unscaled.x - center.x) * scaleX,
    y: center.y + (unscaled.y - center.y) * scaleY
  };
  return "rotation" in bounds ? rotatePointAroundCenter(scaled, center, bounds.rotation) : scaled;
}

export type SnapPolicy = "nearest" | "floor" | "ceil";

export function snapValueToGrid(
  value: number,
  gridSize: number,
  policy: SnapPolicy = "nearest",
  enabled = true
): number {
  if (!enabled) return value;
  if (!Number.isFinite(gridSize) || gridSize <= 0)
    throw new RangeError("gridSize must be a positive finite number");
  const operation = policy === "floor" ? Math.floor : policy === "ceil" ? Math.ceil : Math.round;
  return operation(value / gridSize) * gridSize;
}

export function snapPointToGrid(
  point: Point,
  gridSize: number,
  policy: SnapPolicy = "nearest",
  enabled = true
): Point {
  return {
    x: snapValueToGrid(point.x, gridSize, policy, enabled),
    y: snapValueToGrid(point.y, gridSize, policy, enabled)
  };
}

export function snapRectangleToGrid(
  rectangle: Rectangle,
  gridSize: number,
  policy: SnapPolicy = "nearest",
  enabled = true
): Rectangle {
  return {
    ...snapPointToGrid(rectangle, gridSize, policy, enabled),
    width: snapValueToGrid(rectangle.width, gridSize, policy, enabled),
    height: snapValueToGrid(rectangle.height, gridSize, policy, enabled)
  };
}

export function normalizeRotation(rotation: number): Rotation {
  if (!Number.isFinite(rotation)) throw new RangeError("rotation must be finite");
  return ((rotation % 360) + 360) % 360;
}

export function rectangleToBounds(rectangle: Rectangle): Bounds {
  return {
    left: rectangle.x,
    top: rectangle.y,
    right: rectangle.x + rectangle.width,
    bottom: rectangle.y + rectangle.height
  };
}

export function boundsToRectangle(bounds: Bounds): Rectangle {
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  };
}

export function containsPoint(rectangle: Rectangle, point: Point): boolean {
  const bounds = rectangleToBounds(rectangle);
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

export function intersectsRectangle(left: Rectangle, right: Rectangle): boolean {
  const a = rectangleToBounds(left);
  const b = rectangleToBounds(right);
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function distanceBetweenPoints(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function containsPointInCircle(center: Point, radius: number, point: Point): boolean {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError("Radius must be non-negative.");
  return distanceBetweenPoints(center, point) <= radius;
}

export function applyMatrix(point: Point, matrix: Matrix): Point {
  return {
    x: cleanFloat(matrix.a * point.x + matrix.c * point.y + matrix.e),
    y: cleanFloat(matrix.b * point.x + matrix.d * point.y + matrix.f)
  };
}

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

export function invertMatrix(matrix: Matrix): Matrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12)
    throw new RangeError("Matrix must be invertible.");
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant
  };
}

export function unionBounds(...bounds: readonly Bounds[]): Bounds | undefined {
  if (bounds.length === 0) return undefined;
  return {
    left: Math.min(...bounds.map(({ left }) => left)),
    top: Math.min(...bounds.map(({ top }) => top)),
    right: Math.max(...bounds.map(({ right }) => right)),
    bottom: Math.max(...bounds.map(({ bottom }) => bottom))
  };
}

export function expandBounds(bounds: Bounds, amount: number): Bounds {
  return {
    left: bounds.left - amount,
    top: bounds.top - amount,
    right: bounds.right + amount,
    bottom: bounds.bottom + amount
  };
}

export function translateRectangle(rectangle: Rectangle, delta: Point): Rectangle {
  return { ...rectangle, x: rectangle.x + delta.x, y: rectangle.y + delta.y };
}

export function canvasPointToViewport(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y };
}

export function viewportPointToCanvas(point: Point, viewport: Viewport): Point {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0)
    throw new RangeError("Viewport zoom must be positive.");
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  if (
    !Number.isFinite(zoom) ||
    !Number.isFinite(minZoom) ||
    !Number.isFinite(maxZoom) ||
    minZoom <= 0 ||
    maxZoom < minZoom
  )
    throw new RangeError("Zoom and constraints are invalid.");
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function createDirectRoute(source: Point, target: Point): readonly Point[] {
  return [source, target];
}
