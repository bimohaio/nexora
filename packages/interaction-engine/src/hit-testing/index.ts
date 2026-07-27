import {
  containsPoint,
  containsPointInCircle,
  distanceBetweenPoints,
  intersectsRectangle,
  type Point,
  type Rectangle
} from "@web-scada/geometry";
import type { HitTestCache, HitTestRevision } from "../cache/index.js";
import { HitTestError } from "../errors/index.js";
import type {
  AreaHitQuery,
  HitCandidate,
  PointHitQuery,
  SpatialQuerySource
} from "../queries/index.js";
import { createHitResult, type HitResult } from "../results/index.js";
import type { InteractionHitTester, HitTestQuery, InteractionTarget } from "../types/index.js";

export interface HitTestStrategy {
  readonly id: string;
  supports(candidate: Readonly<HitCandidate>): boolean;
  hit(candidate: Readonly<HitCandidate>, point: Point, radius: number): boolean;
  distance(candidate: Readonly<HitCandidate>, point: Point): number;
}
export class BoundingBoxHitStrategy implements HitTestStrategy {
  public readonly id = "bounding-box";
  public supports(): boolean {
    return true;
  }
  public hit(candidate: HitCandidate, point: Point, radius: number): boolean {
    return (
      containsPoint(candidate.bounds, point) ||
      (radius > 0 &&
        intersectsRectangle(candidate.bounds, {
          x: point.x - radius,
          y: point.y - radius,
          width: radius * 2,
          height: radius * 2
        }))
    );
  }
  public distance(candidate: HitCandidate, point: Point): number {
    if (containsPoint(candidate.bounds, point)) return 0;
    const x = Math.max(
      candidate.bounds.x,
      Math.min(point.x, candidate.bounds.x + candidate.bounds.width)
    );
    const y = Math.max(
      candidate.bounds.y,
      Math.min(point.y, candidate.bounds.y + candidate.bounds.height)
    );
    return distanceBetweenPoints(point, { x, y });
  }
}
export class CircleHitStrategy implements HitTestStrategy {
  public readonly id = "circle";
  public supports(candidate: HitCandidate): boolean {
    return candidate.metadata?.shape === "circle";
  }
  public hit(candidate: HitCandidate, point: Point, radius: number): boolean {
    const center = {
      x: candidate.bounds.x + candidate.bounds.width / 2,
      y: candidate.bounds.y + candidate.bounds.height / 2
    };
    return containsPointInCircle(
      center,
      Math.max(candidate.bounds.width, candidate.bounds.height) / 2 + radius,
      point
    );
  }
  public distance(candidate: HitCandidate, point: Point): number {
    const center = {
      x: candidate.bounds.x + candidate.bounds.width / 2,
      y: candidate.bounds.y + candidate.bounds.height / 2
    };
    return Math.max(
      0,
      distanceBetweenPoints(center, point) -
        Math.max(candidate.bounds.width, candidate.bounds.height) / 2
    );
  }
}
export interface HitTestDiagnosticsSnapshot {
  readonly queryCount: number;
  readonly cacheHits: number;
  readonly cacheHitRatio: number;
  readonly totalQueryDuration: number;
  readonly lastPickedTarget?: string;
}
export class HitTestDiagnostics {
  #queries = 0;
  #hits = 0;
  #duration = 0;
  #picked: string | undefined;
  public constructor(
    public readonly enabled = false,
    private readonly now = () => Date.now()
  ) {}
  public begin(): number | undefined {
    return this.enabled ? this.now() : undefined;
  }
  public end(start: number | undefined, cacheHit: boolean, picked?: string): void {
    if (!this.enabled || start === undefined) return;
    this.#queries++;
    if (cacheHit) this.#hits++;
    this.#duration += Math.max(0, this.now() - start);
    this.#picked = picked;
  }
  public snapshot(): HitTestDiagnosticsSnapshot {
    return Object.freeze({
      queryCount: this.#queries,
      cacheHits: this.#hits,
      cacheHitRatio: this.#queries === 0 ? 0 : this.#hits / this.#queries,
      totalQueryDuration: this.#duration,
      ...(this.#picked === undefined ? {} : { lastPickedTarget: this.#picked })
    });
  }
}
export interface HitTestingEngineOptions {
  readonly source: SpatialQuerySource;
  readonly revision?: () => HitTestRevision;
  readonly strategies?: readonly HitTestStrategy[];
  readonly cache?: HitTestCache;
  readonly diagnostics?: HitTestDiagnostics;
}
const ZERO_REVISION: HitTestRevision = { revision: 0, viewportRevision: 0, documentRevision: 0 };

export class HitTestingEngine implements InteractionHitTester {
  readonly #source: SpatialQuerySource;
  readonly #strategies: HitTestStrategy[];
  readonly #cache: HitTestCache | undefined;
  readonly #revision: () => HitTestRevision;
  public readonly diagnostics: HitTestDiagnostics;
  #disposed = false;
  public constructor(options: HitTestingEngineOptions) {
    this.#source = options.source;
    this.#strategies = [
      ...(options.strategies ?? [new CircleHitStrategy(), new BoundingBoxHitStrategy()])
    ];
    this.#cache = options.cache;
    this.#revision = options.revision ?? (() => ZERO_REVISION);
    this.diagnostics = options.diagnostics ?? new HitTestDiagnostics();
  }
  public registerStrategy(strategy: HitTestStrategy): () => void {
    this.#assertUsable();
    this.#strategies.unshift(strategy);
    this.#cache?.invalidate();
    return () => {
      const index = this.#strategies.indexOf(strategy);
      if (index >= 0) this.#strategies.splice(index, 1);
      this.#cache?.invalidate();
    };
  }
  public query(query: PointHitQuery): readonly HitResult[] {
    this.#assertUsable();
    const start = this.diagnostics.begin();
    const radius = query.radius ?? 0;
    const key = `${query.position.x}:${query.position.y}:${radius}:${query.kinds?.join(",") ?? "*"}`;
    const cached = this.#cache?.get(key, this.#revision());
    if (cached !== undefined) {
      this.diagnostics.end(start, true, cached[0]?.targetId);
      return cached;
    }
    const results = this.#source
      .queryPoint(query.position, radius)
      .filter((candidate) => this.#allowed(candidate, query))
      .flatMap((candidate) => {
        const strategy = this.#strategies.find((entry) => entry.supports(candidate));
        if (!strategy?.hit(candidate, query.position, radius)) return [];
        return [
          createHitResult({
            targetId: candidate.id,
            targetType: candidate.type,
            ...(candidate.layer === undefined ? {} : { layer: candidate.layer }),
            distance: strategy.distance(candidate, query.position),
            depth: candidate.depth ?? 0,
            priority: candidate.priority ?? 0,
            worldPosition: query.position,
            ...(candidate.metadata === undefined ? {} : { metadata: candidate.metadata })
          })
        ];
      })
      .sort(compareHits);
    const frozen = Object.freeze(results);
    this.#cache?.set(key, this.#revision(), frozen);
    this.diagnostics.end(start, false, frozen[0]?.targetId);
    return frozen;
  }
  public pickResult(query: PointHitQuery): HitResult | undefined {
    return this.query(query)[0];
  }
  public pickManyResults(query: PointHitQuery): readonly HitResult[] {
    return this.query(query);
  }
  public queryArea(query: AreaHitQuery): readonly HitResult[] {
    this.#assertUsable();
    return Object.freeze(
      this.#source
        .queryArea(query.area)
        .filter((candidate) => this.#allowed(candidate, query))
        .map((candidate) =>
          createHitResult({
            targetId: candidate.id,
            targetType: candidate.type,
            ...(candidate.layer === undefined ? {} : { layer: candidate.layer }),
            distance: 0,
            depth: candidate.depth ?? 0,
            priority: candidate.priority ?? 0,
            worldPosition: { x: query.area.x, y: query.area.y },
            ...(candidate.metadata === undefined ? {} : { metadata: candidate.metadata })
          })
        )
        .sort(compareHits)
    );
  }
  public queryBounds(bounds: Rectangle, options = {}): readonly HitResult[] {
    return this.queryArea({ ...options, area: bounds });
  }
  public queryRadius(position: Point, radius: number, options = {}): readonly HitResult[] {
    return this.query({ ...options, position, radius });
  }
  public hit(query: HitTestQuery, target: InteractionTarget): boolean {
    return this.query(pointQuery(query)).some(
      (result) => result.targetId === target.id && result.targetType === target.kind
    );
  }
  public pick(query: HitTestQuery): InteractionTarget | undefined {
    const hit = this.query(pointQuery(query))[0];
    return hit === undefined ? undefined : toTarget(hit);
  }
  public pickMany(query: HitTestQuery): readonly InteractionTarget[] {
    return this.query(pointQuery(query)).map(toTarget);
  }
  public invalidate(): void {
    this.#cache?.invalidate();
  }
  public dispose(): void {
    this.#cache?.invalidate();
    this.#strategies.length = 0;
    this.#disposed = true;
  }
  #allowed(
    candidate: HitCandidate,
    query: {
      kinds?: readonly string[];
      includeLocked?: boolean;
      filter?: (candidate: Readonly<HitCandidate>) => boolean;
    }
  ): boolean {
    return (
      candidate.visible !== false &&
      candidate.interactionEnabled !== false &&
      (query.includeLocked === true || candidate.locked !== true) &&
      (query.kinds === undefined || query.kinds.includes(candidate.type)) &&
      (query.filter?.(candidate) ?? true)
    );
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new HitTestError("HIT_TEST_DISPOSED", "Hit testing engine is disposed.");
  }
}
const compareHits = (left: HitResult, right: HitResult): number =>
  (right.priority ?? 0) - (left.priority ?? 0) ||
  (right.depth ?? 0) - (left.depth ?? 0) ||
  (left.distance ?? 0) - (right.distance ?? 0) ||
  left.targetId.localeCompare(right.targetId);
const toTarget = (hit: HitResult): InteractionTarget =>
  Object.freeze({
    id: hit.targetId,
    kind: hit.targetType,
    ...(hit.metadata === undefined ? {} : { metadata: hit.metadata })
  });
const pointQuery = (query: HitTestQuery): PointHitQuery => ({
  position: query.position,
  ...(query.kinds === undefined ? {} : { kinds: query.kinds })
});
