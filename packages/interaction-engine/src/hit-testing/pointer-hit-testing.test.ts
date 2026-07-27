import { describe, expect, it } from "vitest";
import { CoordinateConversionService } from "../coordinates/index.js";
import { HitTestCache } from "../cache/index.js";
import { HitTestingEngine } from "./index.js";
import { PointerEngine } from "../pointer/index.js";
import { LinearSpatialQuery } from "../spatial/index.js";

const candidates = [
  { id: "back", type: "node" as const, bounds: { x: 0, y: 0, width: 20, height: 20 }, depth: 1 },
  { id: "front", type: "port" as const, bounds: { x: 5, y: 5, width: 5, height: 5 }, depth: 2 },
  {
    id: "hidden",
    type: "node" as const,
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    visible: false
  },
  {
    id: "locked",
    type: "node" as const,
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    locked: true
  }
];

describe("pointer and hit testing", () => {
  it("normalizes immutable pointer state through every coordinate space", () => {
    const coordinates = new CoordinateConversionService({
      viewport: { x: 10, y: 20, zoom: 2 },
      screenOrigin: { x: 100, y: 50 },
      canvasTransform: { a: 1, b: 0, c: 0, d: 1, e: 5, f: -5 }
    });
    expect(coordinates.screenToWorld({ x: 130, y: 90 })).toEqual({ x: 15, y: 5 });
    expect(coordinates.worldToScreen({ x: 15, y: 5 })).toEqual({ x: 130, y: 90 });
    const engine = new PointerEngine(coordinates);
    const first = engine.process({
      type: "pointer-down",
      pointerId: 7,
      screen: { x: 130, y: 90 },
      timestamp: 1
    });
    const second = engine.process({
      type: "pointer-move",
      pointerId: 7,
      screen: { x: 132, y: 94 },
      timestamp: 2
    });
    expect(first.state.coordinates.canvas).toEqual({ x: 10, y: 10 });
    expect(second.state.movement).toEqual({ x: 1, y: 2 });
    expect(Object.isFrozen(second.state)).toBe(true);
  });

  it("picks deterministically and filters hidden and locked layers", () => {
    const engine = new HitTestingEngine({ source: new LinearSpatialQuery(() => candidates) });
    expect(engine.pickResult({ position: { x: 6, y: 6 } })?.targetId).toBe("front");
    expect(
      engine.pickManyResults({ position: { x: 6, y: 6 } }).map(({ targetId }) => targetId)
    ).toEqual(["front", "back"]);
    expect(engine.queryArea({ area: { x: 0, y: 0, width: 10, height: 10 } })).toHaveLength(2);
    expect(
      engine.queryArea({ area: { x: 0, y: 0, width: 10, height: 10 }, includeLocked: true })
    ).toHaveLength(3);
  });

  it("invalidates cached results when revisions change", () => {
    let documentRevision = 1;
    let reads = 0;
    const source = new LinearSpatialQuery(() => {
      reads++;
      return candidates;
    });
    const engine = new HitTestingEngine({
      source,
      cache: new HitTestCache(),
      revision: () => ({ revision: 1, viewportRevision: 1, documentRevision })
    });
    engine.query({ position: { x: 1, y: 1 } });
    engine.query({ position: { x: 1, y: 1 } });
    expect(reads).toBe(1);
    documentRevision++;
    engine.query({ position: { x: 1, y: 1 } });
    expect(reads).toBe(2);
  });
});
