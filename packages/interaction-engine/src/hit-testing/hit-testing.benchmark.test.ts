import { describe, expect, it } from "vitest";
import { HitTestingEngine } from "./index.js";
import { LinearSpatialQuery } from "../spatial/index.js";

describe("hit testing performance", () => {
  for (const count of [100, 1_000, 5_000]) {
    it(`queries ${count} nodes`, () => {
      const candidates = Array.from({ length: count }, (_, index) => ({
        id: `node-${index}`,
        type: "node" as const,
        bounds: { x: (index % 100) * 12, y: Math.floor(index / 100) * 12, width: 10, height: 10 }
      }));
      const engine = new HitTestingEngine({ source: new LinearSpatialQuery(() => candidates) });
      const samples: number[] = [];
      for (let index = 0; index < 100; index++) {
        const start = performance.now();
        engine.pickResult({ position: { x: (index % 100) * 12 + 5, y: 5 } });
        samples.push(performance.now() - start);
      }
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const worst = Math.max(...samples);
      console.info(
        `hit-test ${count}: average=${average.toFixed(3)}ms worst=${worst.toFixed(3)}ms`
      );
      expect(Number.isFinite(average)).toBe(true);
      expect(Number.isFinite(worst)).toBe(true);
    });
  }
});
