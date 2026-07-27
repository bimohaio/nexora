import { describe, expect, it, vi } from "vitest";
import type { Point } from "@web-scada/geometry";
import { MinimumMovementConstraint } from "../constraints/index.js";
import { DragEngine } from "./index.js";
import { DragError } from "../errors/index.js";
import type { PointerState } from "../pointer/index.js";

function pointer(id: number, world: Point): PointerState {
  return {
    id,
    type: "mouse",
    position: world,
    movement: { x: 0, y: 0 },
    buttons: 1,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    modifiers: {
      shift: false,
      control: false,
      alt: false,
      meta: false,
      capsLock: false,
      numLock: false,
      scrollLock: false
    },
    timestamp: 0,
    primary: true,
    coordinates: { screen: world, viewport: world, canvas: world, world }
  };
}

describe("DragEngine", () => {
  it("maintains immutable state, previews a shared deterministic delta, and creates one command", () => {
    const update = vi.fn();
    const clear = vi.fn();
    const create = vi.fn((ids: readonly string[], delta: Point) => ({
      type: "move-node",
      ids,
      delta
    }));
    const engine = new DragEngine({
      nodes: (ids) => ids.map((id) => ({ id, position: { x: 0, y: 0 } })),
      commandFactory: { create },
      constraints: [new MinimumMovementConstraint(2)],
      preview: { update, clear }
    });
    const initial = engine.start({
      pointer: pointer(7, { x: 10, y: 10 }),
      draggedIds: ["b", "a", "b"],
      viewportRevision: 4
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(initial.draggedIds).toEqual(["a", "b"]);

    const belowThreshold = engine.update(pointer(7, { x: 11, y: 10 }));
    expect(belowThreshold.temporaryTransform).toBeUndefined();
    const moved = engine.update(pointer(7, { x: 14, y: 16 }));
    expect(moved.movementDelta).toEqual({ x: 4, y: 6 });
    expect(initial.movementDelta).toEqual({ x: 0, y: 0 });
    expect(update).toHaveBeenCalledOnce();

    const result = engine.commit();
    expect(result.committed).toBe(true);
    expect(create).toHaveBeenCalledWith(["a", "b"], { x: 4, y: 6 });
    expect(clear).toHaveBeenCalled();
    expect(() => engine.commit()).toThrow(DragError);
  });

  it("rejects foreign pointers and clears preview on cancellation", () => {
    const clear = vi.fn();
    const engine = new DragEngine({
      nodes: () => [{ id: "a", position: { x: 0, y: 0 } }],
      commandFactory: { create: () => ({ type: "move-node" }) },
      preview: { update: vi.fn(), clear }
    });
    engine.start({ pointer: pointer(1, { x: 0, y: 0 }), draggedIds: ["a"] });
    expect(() => engine.update(pointer(2, { x: 10, y: 0 }))).toThrow("Pointer does not own");
    engine.cancel("pointer-cancel");
    expect(clear).toHaveBeenCalled();
    expect(engine.state).toBeUndefined();
  });
});
