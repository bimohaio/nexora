import type { Point } from "@web-scada/geometry";
import type { MoveCommandFactory } from "../commands/index.js";
import type { MoveCommandLike } from "../types/drag.js";

export function createMoveCommand(
  factory: MoveCommandFactory,
  nodeIds: readonly string[],
  delta: Point
): MoveCommandLike {
  return factory.create(Object.freeze([...nodeIds]), Object.freeze({ ...delta }));
}
