import type { Point, Rectangle } from "@web-scada/geometry";
import type { InteractionTargetKind } from "../types/index.js";

export interface HitQueryOptions {
  readonly kinds?: readonly InteractionTargetKind[];
  readonly includeLocked?: boolean;
  readonly filter?: (candidate: Readonly<HitCandidate>) => boolean;
}
export interface PointHitQuery extends HitQueryOptions {
  readonly position: Point;
  readonly radius?: number;
}
export interface AreaHitQuery extends HitQueryOptions {
  readonly area: Rectangle;
}
export interface HitCandidate {
  readonly id: string;
  readonly type: InteractionTargetKind;
  readonly bounds: Rectangle;
  readonly layer?: string;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly interactionEnabled?: boolean;
  readonly depth?: number;
  readonly priority?: number;
  readonly revision?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface SpatialQuerySource {
  queryPoint(point: Point, radius: number): readonly HitCandidate[];
  queryArea(area: Rectangle): readonly HitCandidate[];
}
