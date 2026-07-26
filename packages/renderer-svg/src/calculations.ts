import type { ScadaConnection, ScadaDocument } from "@web-scada/core";
import {
  calculatePortPosition,
  clampZoom,
  type Point,
  type Rectangle,
  type Size,
  type Viewport
} from "@web-scada/geometry";
import type { GridPattern, RenderChangeSet } from "./contracts.js";

export function createNodeTransform(
  transform: ScadaDocument["nodes"][number]["transform"]
): string {
  const centerX = transform.width / 2;
  const centerY = transform.height / 2;
  return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation} ${centerX} ${centerY}) scale(${transform.scaleX} ${transform.scaleY})`;
}

export function createPathData(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

export function createDirectConnectionPoints(source: Point, target: Point): readonly Point[] {
  return [source, target];
}

export function createManualConnectionPoints(
  source: Point,
  waypoints: readonly Point[],
  target: Point
): readonly Point[] {
  return [source, ...waypoints, target];
}

export function createOrthogonalConnectionPoints(source: Point, target: Point): readonly Point[] {
  const middleX = (source.x + target.x) / 2;
  return [source, { x: middleX, y: source.y }, { x: middleX, y: target.y }, target];
}

export function resolveConnectionPoints(
  connection: ScadaConnection,
  source: Point,
  target: Point
): readonly Point[] {
  if (connection.routing === "manual")
    return createManualConnectionPoints(source, connection.waypoints, target);
  if (connection.routing === "orthogonal") return createOrthogonalConnectionPoints(source, target);
  return createDirectConnectionPoints(source, target);
}

export function calculateViewportTransform(viewport: Viewport): string {
  return `translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`;
}

export function zoomViewportAtPoint(
  viewport: Viewport,
  zoom: number,
  anchor: Point,
  minZoom = 0.1,
  maxZoom = 8
): Viewport {
  const nextZoom = clampZoom(zoom, minZoom, maxZoom);
  const canvasX = (anchor.x - viewport.x) / viewport.zoom;
  const canvasY = (anchor.y - viewport.y) / viewport.zoom;
  return {
    x: anchor.x - canvasX * nextZoom,
    y: anchor.y - canvasY * nextZoom,
    zoom: nextZoom
  };
}

export function fitRectangleToViewport(
  content: Rectangle,
  viewportSize: Size,
  padding = 32,
  minZoom = 0.1,
  maxZoom = 8
): Viewport {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availableWidth / content.width, availableHeight / content.height),
    minZoom,
    maxZoom
  );
  return {
    x: (viewportSize.width - content.width * zoom) / 2 - content.x * zoom,
    y: (viewportSize.height - content.height * zoom) / 2 - content.y * zoom,
    zoom
  };
}

export interface GridConfiguration {
  readonly pattern: GridPattern;
  readonly size: number;
  readonly pathData?: string;
  readonly dot?: Point;
}

export function createGridConfiguration(pattern: GridPattern, size: number): GridConfiguration {
  if (!Number.isFinite(size) || size <= 0) throw new RangeError("Grid size must be positive.");
  if (pattern === "dots") return { pattern, size, dot: { x: 1, y: 1 } };
  if (pattern === "cross")
    return {
      pattern,
      size,
      pathData: `M ${size / 2 - 2} ${size / 2} h 4 M ${size / 2} ${size / 2 - 2} v 4`
    };
  return { pattern, size, pathData: `M ${size} 0 L 0 0 0 ${size}` };
}

export function normalizeRenderChangeSet(changes: Partial<RenderChangeSet>): RenderChangeSet {
  const unique = (values: readonly string[] | undefined): readonly string[] =>
    [...new Set(values ?? [])].sort();
  return {
    addedNodeIds: unique(changes.addedNodeIds),
    updatedNodeIds: unique(changes.updatedNodeIds),
    removedNodeIds: unique(changes.removedNodeIds),
    addedConnectionIds: unique(changes.addedConnectionIds),
    updatedConnectionIds: unique(changes.updatedConnectionIds),
    removedConnectionIds: unique(changes.removedConnectionIds),
    addedLayerIds: unique(changes.addedLayerIds),
    updatedLayerIds: unique(changes.updatedLayerIds),
    removedLayerIds: unique(changes.removedLayerIds),
    addedVariableIds: unique(changes.addedVariableIds),
    updatedVariableIds: unique(changes.updatedVariableIds),
    removedVariableIds: unique(changes.removedVariableIds),
    addedBindingIds: unique(changes.addedBindingIds),
    updatedBindingIds: unique(changes.updatedBindingIds),
    removedBindingIds: unique(changes.removedBindingIds),
    canvasChanged: changes.canvasChanged ?? false,
    metadataChanged: changes.metadataChanged ?? false,
    runtimeSettingsChanged: changes.runtimeSettingsChanged ?? false,
    viewportChanged: changes.viewportChanged ?? false,
    symbolRegistryChanged: changes.symbolRegistryChanged ?? false
  };
}

export function resolvePortPosition(node: ScadaDocument["nodes"][number], position: Point): Point {
  return calculatePortPosition(node.transform, position);
}
