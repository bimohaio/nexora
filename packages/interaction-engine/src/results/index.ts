import type { Point } from "@web-scada/geometry";
import type { InteractionTargetKind } from "../types/index.js";

export interface HitResultInit {
  readonly targetId: string;
  readonly targetType: InteractionTargetKind;
  readonly layer?: string;
  readonly distance?: number;
  readonly depth?: number;
  readonly priority?: number;
  readonly localPosition?: Point;
  readonly worldPosition: Point;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export type HitResult = HitResultInit;

export function createHitResult(init: HitResultInit): HitResult {
  return Object.freeze({
    ...init,
    worldPosition: Object.freeze({ ...init.worldPosition }),
    ...(init.localPosition === undefined
      ? {}
      : { localPosition: Object.freeze({ ...init.localPosition }) }),
    ...(init.metadata === undefined ? {} : { metadata: Object.freeze({ ...init.metadata }) })
  });
}
