import { describe, expect, it } from "vitest";
import { CoordinateConversionService } from "../coordinates/index.js";
import { DragEngine } from "../drag/index.js";
import { FocusEngine } from "../focus/index.js";
import { HitTestingEngine } from "../hit-testing/index.js";
import { PointerEngine, type PointerState } from "../pointer/index.js";
import { LinearSpatialQuery } from "../spatial/index.js";
import { SelectionManager } from "../selection/manager/index.js";
import type { FocusTarget } from "../types/keyboard.js";
import type { InteractionTarget } from "../types/index.js";
import {
  INTERACTION_BENCHMARK_SIZES,
  runInteractionBenchmark,
  type InteractionBenchmarkResult
} from "./index.js";

function pointer(x: number, y: number): PointerState {
  const point = { x, y };
  return {
    id: 1,
    type: "mouse",
    position: point,
    movement: point,
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
    timestamp: x,
    primary: true,
    coordinates: { screen: point, viewport: point, canvas: point, world: point }
  };
}

describe("interaction performance benchmark", () => {
  for (const size of INTERACTION_BENCHMARK_SIZES)
    it(`stays responsive with ${String(size)} nodes`, () => {
      const ids = Array.from({ length: size }, (_value, index) => `node_${String(index)}`);
      const targets: InteractionTarget[] = ids.map((id) => ({ id, kind: "node" }));
      const focusTargets: FocusTarget[] = ids.map((id, order) => ({ id, kind: "node", order }));
      const candidates = ids.map((id, index) => ({
        id,
        type: "node" as const,
        bounds: { x: index * 2, y: 0, width: 1, height: 1 },
        depth: 0
      }));
      const pointerEngine = new PointerEngine(
        new CoordinateConversionService({ viewport: { x: 10, y: 20, zoom: 2 } })
      );
      let pointerIndex = 0;
      const pointerResult = runInteractionBenchmark(
        "pointer",
        size,
        () => {
          pointerIndex++;
          pointerEngine.process({
            type: "pointer-move",
            pointerId: 1,
            screen: { x: pointerIndex % size, y: pointerIndex % 100 },
            timestamp: pointerIndex
          });
        },
        { iterations: 200, memory: () => process.memoryUsage().heapUsed }
      );

      const drag = new DragEngine({
        nodes: (nodeIds) => nodeIds.map((id) => ({ id, position: { x: 0, y: 0 } })),
        commandFactory: { create: () => ({ type: "move-node" }) }
      });
      drag.start({ pointer: pointer(0, 0), draggedIds: ids });
      let dragIndex = 0;
      const dragResult = runInteractionBenchmark(
        "drag",
        size,
        () => {
          dragIndex++;
          drag.update(pointer(dragIndex, dragIndex));
        },
        { iterations: 50, memory: () => process.memoryUsage().heapUsed }
      );
      drag.cancel();

      const selection = new SelectionManager();
      const selectionResult = runInteractionBenchmark(
        "selection",
        size,
        () => selection.replace(targets, "keyboard"),
        { iterations: 5, memory: () => process.memoryUsage().heapUsed }
      );
      const focus = new FocusEngine();
      focus.setTargets(focusTargets);
      const focusResult = runInteractionBenchmark(
        "focus",
        size,
        () => {
          focus.traverse("next");
        },
        { iterations: 500, memory: () => process.memoryUsage().heapUsed }
      );
      const hits = new HitTestingEngine({ source: new LinearSpatialQuery(() => candidates) });
      let hitIndex = 0;
      const hitResult = runInteractionBenchmark(
        "hit-testing",
        size,
        () => {
          hitIndex++;
          hits.query({ position: { x: (hitIndex * 17) % (size * 2), y: 0 } });
        },
        { iterations: 50, memory: () => process.memoryUsage().heapUsed }
      );
      const results: readonly InteractionBenchmarkResult[] = [
        pointerResult,
        dragResult,
        selectionResult,
        focusResult,
        hitResult
      ];
      console.info(JSON.stringify({ size, results }));
      expect(results.every(({ withinFrameBudget }) => withinFrameBudget)).toBe(true);
    });
});
