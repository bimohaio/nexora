import type { ScadaDocument, ScadaNode } from "@web-scada/core";
import { snapValueToGrid, type Point } from "@web-scada/geometry";
import type { AlignmentGuide, SnapOptions } from "./contracts.js";

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
