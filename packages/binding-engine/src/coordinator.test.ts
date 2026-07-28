import type { JsonValue, PropertyBinding } from "@web-scada/core";
import type { RuntimeSnapshot } from "@web-scada/runtime-engine";
import { describe, expect, it, vi } from "vitest";
import {
  BindingEvaluationCoordinator,
  BoundedBindingCache,
  CompiledExpressionCache,
  ImmediateBindingSchedulingAdapter,
  ManualBindingSchedulingAdapter,
  createBindingDefinitionFingerprint,
  type BindingEvaluationRequest
} from "./index.js";

function binding(id: string): PropertyBinding {
  return {
    id,
    source: { type: "tag", tagId: id },
    target: { type: "node-property", nodeId: `node-${id}`, property: "value" },
    mode: "one-way",
    enabled: true
  };
}

function runtime(revision: number, values: Readonly<Record<string, JsonValue>>): RuntimeSnapshot {
  return {
    revision,
    timestamp: revision,
    size: Object.keys(values).length,
    has: (key) => key in values,
    get: (key) => {
      const value = values[key];
      return value === undefined
        ? undefined
        : { key, value, quality: "good", timestamp: revision, ingestionTimestamp: revision };
    },
    getAll: () => []
  };
}

function request(revision: number, keys: readonly string[]): BindingEvaluationRequest {
  const snapshot = runtime(revision, Object.fromEntries(keys.map((key) => [key, revision])));
  return {
    runtimeRevision: revision,
    context: { runtime: snapshot, locale: "en-US" },
    changedInputs: keys.map((key) => ({ kind: "runtime-value" as const, key }))
  };
}

describe("binding evaluation coordinator", () => {
  it("evaluates immediately and produces an immutable report", () => {
    const coordinator = new BindingEvaluationCoordinator([binding("a")], {
      schedulingMode: "immediate"
    });
    const outcome = coordinator.requestEvaluation({ ...request(1, ["a"]), full: true });
    expect(outcome.status).toBe("committed");
    expect(outcome.evaluatedBindings).toBe(1);
    expect(Object.isFrozen(outcome)).toBe(true);
  });

  it("supports a synchronous injected scheduling adapter without retaining a stale handle", () => {
    const outcomes: string[] = [];
    const coordinator = new BindingEvaluationCoordinator([binding("a")], {
      scheduler: new ImmediateBindingSchedulingAdapter(),
      onOutcome: ({ status }) => outcomes.push(status)
    });
    expect(coordinator.requestEvaluation(request(1, ["a"])).status).toBe("scheduled");
    expect(outcomes).toEqual(["committed"]);
    expect(coordinator.cancelScheduled().status).toBe("no-changes");
  });

  it("coalesces deferred requests behind exactly one scheduled flush", () => {
    const scheduler = new ManualBindingSchedulingAdapter();
    const outcomes: string[] = [];
    const coordinator = new BindingEvaluationCoordinator([binding("a"), binding("b")], {
      scheduler,
      onOutcome: ({ status }) => outcomes.push(status)
    });
    coordinator.requestEvaluation(request(1, ["a"]));
    coordinator.requestEvaluation(request(2, ["b"]));
    coordinator.requestEvaluation(request(3, ["a"]));
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flushAll();
    expect(coordinator.statistics()).toMatchObject({
      requests: 3,
      scheduledFlushes: 1,
      executions: 1
    });
    expect(outcomes).toEqual(["committed"]);
  });

  it("manual mode waits for explicit flush and rejects stale requests", () => {
    const coordinator = new BindingEvaluationCoordinator([binding("a")], {
      schedulingMode: "manual"
    });
    expect(coordinator.requestEvaluation(request(2, ["a"])).status).toBe("scheduled");
    expect(coordinator.requestEvaluation(request(1, ["a"])).status).toBe("superseded");
    expect(coordinator.flush().status).toBe("committed");
  });

  it("preserves pending work when a scheduler throws", () => {
    const coordinator = new BindingEvaluationCoordinator([binding("a")], {
      scheduler: {
        schedule: () => {
          throw new Error("fault");
        }
      }
    });
    expect(coordinator.requestEvaluation(request(1, ["a"])).status).toBe("failed");
    expect(coordinator.flush().status).toBe("committed");
  });

  it("isolates a failed binding and keeps its last valid result", () => {
    let failA = false;
    const evaluate = vi.fn(
      (definition: Readonly<PropertyBinding>, context: { runtime: RuntimeSnapshot }) => {
        if (definition.id === "a" && failA) throw new Error("fault");
        return {
          bindingId: definition.id,
          status: "resolved" as const,
          target: definition.target,
          value: context.runtime.get(definition.id)?.value ?? null,
          dependencies: [{ kind: "runtime-value" as const, key: definition.id }],
          diagnostics: []
        };
      }
    );
    const coordinator = new BindingEvaluationCoordinator([binding("a"), binding("b")], {
      schedulingMode: "immediate",
      evaluate
    });
    coordinator.requestEvaluation({ ...request(1, ["a", "b"]), full: true });
    failA = true;
    const outcome = coordinator.requestEvaluation(request(2, ["a", "b"]));
    expect(outcome.status).toBe("partial");
    expect(outcome.failedBindings).toBe(1);
    expect(outcome.result?.visual.snapshot.targets.size).toBe(2);
  });

  it("cancels and disposes idempotently without accepting later work", () => {
    const scheduler = new ManualBindingSchedulingAdapter();
    const coordinator = new BindingEvaluationCoordinator([binding("a")], { scheduler });
    coordinator.requestEvaluation(request(1, ["a"]));
    coordinator.dispose();
    coordinator.dispose();
    expect(scheduler.pendingCount).toBe(0);
    expect(coordinator.requestEvaluation(request(2, ["a"])).status).toBe("disposed");
  });

  it("removal changes the generation and cannot be restored by pending work", () => {
    const coordinator = new BindingEvaluationCoordinator([binding("a")], {
      schedulingMode: "manual"
    });
    coordinator.requestEvaluation({ ...request(1, ["a"]), removedBindings: ["a"] });
    const outcome = coordinator.flush();
    expect(outcome.result?.plan.orderedBindingIds).toEqual([]);
  });
});

describe("binding caches", () => {
  it("fingerprints equivalent object order identically and semantic changes differently", () => {
    expect(createBindingDefinitionFingerprint({ b: 2, a: 1 })).toBe(
      createBindingDefinitionFingerprint({ a: 1, b: 2 })
    );
    expect(createBindingDefinitionFingerprint({ a: 1 })).not.toBe(
      createBindingDefinitionFingerprint({ a: 2 })
    );
  });

  it("uses bounded deterministic LRU eviction and supports zero capacity", () => {
    const cache = new BoundedBindingCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.snapshot()).toMatchObject({ size: 2, evictions: 1 });
    const disabled = new BoundedBindingCache<number>(0);
    disabled.set("a", 1);
    expect(disabled.snapshot().size).toBe(0);
  });

  it("reuses compiled artifacts and invalidates them by registry revision", () => {
    const cache = new CompiledExpressionCache(2);
    expect(cache.compile("$a + 1").success).toBe(true);
    expect(cache.compile("$a + 1").success).toBe(true);
    expect(cache.compile("$a + 1", {}, 1).success).toBe(true);
    expect(cache.statistics()).toMatchObject({ hits: 1, misses: 2, size: 2 });
  });
});
