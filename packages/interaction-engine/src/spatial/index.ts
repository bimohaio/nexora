import {
  containsPoint,
  distanceBetweenPoints,
  intersectsRectangle,
  type Point,
  type Rectangle
} from "@web-scada/geometry";
import type { HitCandidate, SpatialQuerySource } from "../queries/index.js";
import { RevisionedCache } from "../cache/index.js";

export interface SpatialQueries<T> {
  nearest(point: Point): T | undefined;
  intersects(area: Rectangle): readonly T[];
  contains(point: Point): readonly T[];
  within(area: Rectangle): readonly T[];
  overlap(area: Rectangle): readonly T[];
}

export class LinearSpatialQuery implements SpatialQuerySource, SpatialQueries<HitCandidate> {
  public constructor(private readonly candidates: () => readonly HitCandidate[]) {}
  public queryPoint(point: Point, radius: number): readonly HitCandidate[] {
    const area = {
      x: point.x - radius,
      y: point.y - radius,
      width: radius * 2,
      height: radius * 2
    };
    return this.candidates().filter(
      ({ bounds }) =>
        containsPoint(bounds, point) || (radius > 0 && intersectsRectangle(bounds, area))
    );
  }
  public queryArea(area: Rectangle): readonly HitCandidate[] {
    return this.intersects(area);
  }
  public nearest(point: Point): HitCandidate | undefined {
    return [...this.candidates()].sort(
      (a, b) =>
        distanceBetweenPoints(point, center(a.bounds)) -
        distanceBetweenPoints(point, center(b.bounds))
    )[0];
  }
  public intersects(area: Rectangle): readonly HitCandidate[] {
    return this.candidates().filter(({ bounds }) => intersectsRectangle(bounds, area));
  }
  public contains(point: Point): readonly HitCandidate[] {
    return this.candidates().filter(({ bounds }) => containsPoint(bounds, point));
  }
  public within(area: Rectangle): readonly HitCandidate[] {
    return this.candidates().filter(
      ({ bounds }) =>
        containsPoint(area, { x: bounds.x, y: bounds.y }) &&
        containsPoint(area, { x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    );
  }
  public overlap(area: Rectangle): readonly HitCandidate[] {
    return this.intersects(area);
  }
}

export interface SpatialIndex<T> {
  rebuild(entries: readonly T[], revision: number): void;
  update(addedOrUpdated: readonly T[], removedIds: readonly string[], revision: number): void;
  queryPoint(point: Point, radius: number): readonly T[];
  queryArea(area: Rectangle): readonly T[];
  invalidate(revision?: number): void;
}

export class BoundingVolumeCache {
  readonly #bounds = new RevisionedCache<string, Rectangle>(20_000);
  public get(id: string, revision: number): Rectangle | undefined {
    return this.#bounds.get(id, revision);
  }
  public set(id: string, bounds: Rectangle, revision: number): void {
    this.#bounds.set(id, Object.freeze({ ...bounds }), revision);
  }
  public invalidate(revision?: number): void {
    this.#bounds.invalidate(revision);
  }
  public invalidateEntity(id: string): boolean {
    return this.#bounds.invalidateKey(id);
  }
  public dispose(): void {
    this.#bounds.dispose();
  }
}
const center = (rectangle: Rectangle): Point => ({
  x: rectangle.x + rectangle.width / 2,
  y: rectangle.y + rectangle.height / 2
});
