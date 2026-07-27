export interface InteractionPoint {
  readonly x: number;
  readonly y: number;
}

export type CoordinateSpace = "screen" | "viewport" | "canvas" | "world" | "local-symbol";

export interface CoordinatePoint extends InteractionPoint {
  readonly space: CoordinateSpace;
  readonly symbolId?: string;
}

export interface CoordinateConverter {
  convert(
    point: Readonly<CoordinatePoint>,
    to: CoordinateSpace,
    symbolId?: string
  ): CoordinatePoint;
}

export type InteractionTargetKind =
  "canvas" | "layer" | "node" | "connection" | "port" | "handle" | "overlay" | "custom";

export interface InteractionTarget {
  readonly id: string;
  readonly kind: InteractionTargetKind;
  readonly parentId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HitTestQuery {
  readonly position: CoordinatePoint;
  readonly kinds?: readonly InteractionTargetKind[];
}

export interface InteractionHitTester {
  hit(query: Readonly<HitTestQuery>, target: Readonly<InteractionTarget>): boolean;
  pick(query: Readonly<HitTestQuery>): InteractionTarget | undefined;
  pickMany(query: Readonly<HitTestQuery>): readonly InteractionTarget[];
}

export interface InteractionScheduler {
  schedule(task: () => void): { cancel(): void };
}

export interface Disposable {
  dispose(): void;
}
export * from "./drag.js";
export * from "./keyboard.js";
export * from "./accessibility.js";
export * from "./performance.js";
