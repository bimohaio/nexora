import type { ScadaDocument, ScadaNode } from "@web-scada/core";
import { snapValueToGrid, type Point } from "@web-scada/geometry";
import type { AlignmentGuide, SnapCandidate, SnapCandidateType, SnapOptions } from "./contracts.js";

const SNAP_PRIORITY: Readonly<Record<SnapCandidateType, number>> = {
  guide: 0,
  port: 1,
  rotation: 2,
  alignment: 3,
  spacing: 4,
  edge: 5,
  center: 5,
  waypoint: 6,
  grid: 7
};

export function documentSnapTolerance(screenPixels: number, zoom: number): number {
  if (!Number.isFinite(screenPixels) || screenPixels < 0 || !Number.isFinite(zoom) || zoom <= 0)
    throw new RangeError("Snap tolerance and zoom must be finite and positive.");
  return screenPixels / zoom;
}

export function rankSnapCandidates(candidates: readonly SnapCandidate[]): readonly SnapCandidate[] {
  return [...candidates].sort((left, right) => {
    const priority =
      (left.priority ?? SNAP_PRIORITY[left.type]) - (right.priority ?? SNAP_PRIORITY[right.type]);
    if (priority !== 0) return priority;
    if (left.distance !== right.distance) return left.distance - right.distance;
    const type = left.type.localeCompare(right.type);
    if (type !== 0) return type;
    const source = (left.sourceId ?? "").localeCompare(right.sourceId ?? "");
    return source || (left.targetId ?? "").localeCompare(right.targetId ?? "");
  });
}

export interface SnapResult {
  readonly delta: Point;
  readonly guides: readonly AlignmentGuide[];
}

function nearestAlignment(
  value: number,
  candidates: readonly number[],
  threshold: number
): number | undefined {
  let nearest: number | undefined;
  let distance = threshold + 1;
  for (const candidate of candidates) {
    const candidateDistance = Math.abs(candidate - value);
    if (candidateDistance <= threshold && candidateDistance < distance) {
      nearest = candidate;
      distance = candidateDistance;
    }
  }
  return nearest;
}

export function snapNodeDelta(
  document: Readonly<ScadaDocument>,
  movingNodes: readonly ScadaNode[],
  delta: Point,
  options: SnapOptions
): SnapResult {
  if (!options.enabled || movingNodes.length === 0) return { delta, guides: [] };
  const first = movingNodes[0];
  if (first === undefined) return { delta, guides: [] };
  let x = first.transform.x + delta.x;
  let y = first.transform.y + delta.y;
  const guides: AlignmentGuide[] = [];
  if (options.grid) {
    x = snapValueToGrid(x, document.canvas.gridSize);
    y = snapValueToGrid(y, document.canvas.gridSize);
  }
  if (options.alignment || options.boundingBoxes) {
    const movingIds = new Set(movingNodes.map(({ id }) => id));
    const stationary = document.nodes.filter(({ id, visible }) => visible && !movingIds.has(id));
    const xCandidates = stationary.flatMap(({ transform }) => [
      transform.x,
      transform.x + transform.width / 2,
      transform.x + transform.width
    ]);
    const yCandidates = stationary.flatMap(({ transform }) => [
      transform.y,
      transform.y + transform.height / 2,
      transform.y + transform.height
    ]);
    const alignedX = nearestAlignment(x, xCandidates, options.threshold);
    const alignedY = nearestAlignment(y, yCandidates, options.threshold);
    if (alignedX !== undefined) {
      x = alignedX;
      guides.push({ axis: "x", position: alignedX, from: 0, to: document.canvas.height });
    }
    if (alignedY !== undefined) {
      y = alignedY;
      guides.push({ axis: "y", position: alignedY, from: 0, to: document.canvas.width });
    }
  }
  return {
    delta: { x: x - first.transform.x, y: y - first.transform.y },
    guides
  };
}
