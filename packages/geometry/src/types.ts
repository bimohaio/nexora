export interface Point {
  readonly x: number;
  readonly y: number;
}

export type NormalizedPoint = Point;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rectangle extends Point, Size {}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type Rotation = number;

export interface Transform extends Rectangle {
  readonly rotation: Rotation;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ViewportConstraints {
  readonly minZoom: number;
  readonly maxZoom: number;
}

export type Waypoint = Point;

export interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface CoordinateTransformer {
  toCanvas(point: Point): Point;
  toScreen(point: Point): Point;
}

export interface IntersectionResult {
  readonly intersects: boolean;
  readonly points: readonly Point[];
}

export type ConnectionRouting = "direct" | "orthogonal" | "manual";

export interface ConnectionRouteRequest {
  readonly source: Point;
  readonly target: Point;
  readonly routing: ConnectionRouting;
  readonly waypoints: readonly Waypoint[];
}

export interface ResolvedConnectionEndpoint {
  readonly point: Point;
  readonly direction: "input" | "output" | "bidirectional" | "passive";
  readonly nodeBounds: Rectangle;
  readonly portId: string;
  readonly nodeId: string;
}

export interface ConnectionRouteInput {
  readonly source: ResolvedConnectionEndpoint;
  readonly target: ResolvedConnectionEndpoint;
  readonly routing: ConnectionRouting;
  readonly waypoints: readonly Waypoint[];
}

export interface ConnectionRoute {
  readonly points: readonly Point[];
  readonly routing: ConnectionRouting;
}

export interface ConnectionRouter {
  route(request: ConnectionRouteRequest): readonly Point[];
}
