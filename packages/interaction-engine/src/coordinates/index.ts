import {
  applyMatrix,
  canvasPointToViewport,
  invertMatrix,
  viewportPointToCanvas,
  type Matrix,
  type Point,
  type Viewport
} from "@web-scada/geometry";
import { CoordinateError } from "../errors/index.js";

export interface CoordinateConfiguration {
  readonly viewport: Viewport;
  readonly screenOrigin?: Point;
  readonly canvasTransform?: Matrix;
  readonly localTransforms?: ReadonlyMap<string, Matrix>;
}

const IDENTITY: Matrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const finite = (point: Point): Point => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new CoordinateError("COORDINATE_INVALID", "Coordinates must be finite.");
  return point;
};

export class CoordinateConversionService {
  readonly #config: CoordinateConfiguration;
  public constructor(configuration: CoordinateConfiguration) {
    if (!Number.isFinite(configuration.viewport.zoom) || configuration.viewport.zoom <= 0)
      throw new CoordinateError("COORDINATE_TRANSFORM_INVALID", "Viewport zoom must be positive.");
    this.#config = configuration;
  }
  public screenToViewport(point: Point): Point {
    const origin = this.#config.screenOrigin ?? { x: 0, y: 0 };
    return finite({ x: point.x - origin.x, y: point.y - origin.y });
  }
  public viewportToScreen(point: Point): Point {
    const origin = this.#config.screenOrigin ?? { x: 0, y: 0 };
    return finite({ x: point.x + origin.x, y: point.y + origin.y });
  }
  public viewportToCanvas(point: Point): Point {
    return viewportPointToCanvas(finite(point), this.#config.viewport);
  }
  public canvasToViewport(point: Point): Point {
    return canvasPointToViewport(finite(point), this.#config.viewport);
  }
  public canvasToWorld(point: Point): Point {
    return applyMatrix(finite(point), this.#config.canvasTransform ?? IDENTITY);
  }
  public worldToCanvas(point: Point): Point {
    try {
      return applyMatrix(finite(point), invertMatrix(this.#config.canvasTransform ?? IDENTITY));
    } catch (cause) {
      throw new CoordinateError("COORDINATE_TRANSFORM_INVALID", "Canvas transform is invalid.", {
        cause
      });
    }
  }
  public worldToLocal(point: Point, symbolId: string): Point {
    return applyMatrix(finite(point), invertMatrix(this.#localTransform(symbolId)));
  }
  public localToWorld(point: Point, symbolId: string): Point {
    return applyMatrix(finite(point), this.#localTransform(symbolId));
  }
  public screenToWorld(point: Point): Point {
    return this.canvasToWorld(this.viewportToCanvas(this.screenToViewport(point)));
  }
  public worldToScreen(point: Point): Point {
    return this.viewportToScreen(this.canvasToViewport(this.worldToCanvas(point)));
  }
  #localTransform(symbolId: string): Matrix {
    const transform = this.#config.localTransforms?.get(symbolId);
    if (transform === undefined)
      throw new CoordinateError(
        "COORDINATE_TRANSFORM_MISSING",
        `No local transform is registered for "${symbolId}".`
      );
    return transform;
  }
}
