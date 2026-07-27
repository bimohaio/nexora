import type { Point } from "@web-scada/geometry";
import type { MoveCommandLike } from "../types/drag.js";

export interface MoveCommandFactory {
  create(nodeIds: readonly string[], delta: Readonly<Point>): MoveCommandLike;
}
