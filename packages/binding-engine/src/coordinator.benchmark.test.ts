import type { PropertyBinding } from "@web-scada/core";
import type { RuntimeSnapshot } from "@web-scada/runtime-engine";
import { describe, expect, it } from "vitest";
import {
  BindingEvaluationCoordinator,
  IncrementalBindingEngine,
  ManualBindingSchedulingAdapter
} from "./index.js";

function bindings(count: number): readonly PropertyBinding[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `binding-${String(index)}`,
    source: { type: "tag" as const, tagId: `tag-${String(index)}` },
    target: {
      type: "node-property" as const,
      nodeId: `node-${String(index)}`,
      property: "value"
    },
    mode: "one-way" as const,
    enabled: true
  }));
}

function snapshot(revision: number): RuntimeSnapshot {
  return {
    revision,
    timestamp: revision,
    size: 1_000,
    has: () => true,
    get: (key) => ({
      key,
      value: Number(key.slice("tag-".length)),
      quality: "good",
      timestamp: revision,
      ingestionTimestamp: revision
    }),
    getAll: () => []
  };
}

describe("binding coordinator performance diagnostics", () => {
  it.each([100, 500, 1_000, 5_000, 10_000])(
    "measures initial and single-key incremental evaluation for %i bindings",
    (bindingCount) => {
      const engine = new IncrementalBindingEngine(bindings(bindingCount));
      const initialStarted = performance.now();
      const initial = engine.evaluateAll({
        runtime: snapshot(1),
        locale: "en-US",
        timestamp: 1
      });
      const initialMs = performance.now() - initialStarted;
      const incrementalStarted = performance.now();
      const incremental = engine.evaluateChanges(
        { runtime: snapshot(2), locale: "en-US", timestamp: 2 },
        {
          revision: 2,
          changed: [{ kind: "runtime-value", key: "tag-0" }]
        }
      );
      const incrementalMs = performance.now() - incrementalStarted;
      const cacheHitRatio =
        incremental.statistics.evaluatedBindingCount === 0
          ? 1
          : incremental.statistics.unchangedBindingCount /
            incremental.statistics.evaluatedBindingCount;
      console.log(
        JSON.stringify({
          environment: `node ${process.version}`,
          bindingCount,
          initialMs,
          incrementalMs,
          initialEvaluations: initial.statistics.evaluatedBindingCount,
          incrementalEvaluations: incremental.statistics.evaluatedBindingCount,
          dirtyPropagation: incremental.statistics.affectedBindingCount,
          cacheHitRatio
        })
      );
      expect(initial.statistics.evaluatedBindingCount).toBe(bindingCount);
      expect(incremental.statistics.evaluatedBindingCount).toBe(1);
      expect(incremental.statistics.affectedBindingCount).toBe(1);
      expect(cacheHitRatio).toBe(1);
      engine.dispose();
    }
  );

  it("coalesces 1,000 requests into one pass across 1,000 bindings", () => {
    const started = performance.now();
    const scheduler = new ManualBindingSchedulingAdapter();
    const coordinator = new BindingEvaluationCoordinator(bindings(1_000), { scheduler });
    for (let revision = 1; revision <= 1_000; revision += 1)
      coordinator.requestEvaluation({
        runtimeRevision: revision,
        context: { runtime: snapshot(revision), locale: "en-US" },
        changedInputs: [{ kind: "runtime-value", key: `tag-${String(revision % 50)}` }]
      });
    scheduler.flushAll();
    const statistics = coordinator.statistics();
    console.log(
      JSON.stringify({
        environment: `node ${process.version}`,
        bindingCount: 1_000,
        requestCount: 1_000,
        changedInputCount: 50,
        repetitions: 1,
        cacheState: "cold-to-warm",
        elapsedMs: performance.now() - started,
        executions: statistics.executions
      })
    );
    expect(statistics.executions).toBe(1);
    coordinator.dispose();
  });
});
