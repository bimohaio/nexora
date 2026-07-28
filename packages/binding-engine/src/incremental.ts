import type { JsonValue } from "@web-scada/core";
import type { RuntimeChangeSet, RuntimeSnapshot } from "@web-scada/runtime-engine";
import type {
  BindingDefinition,
  BindingDependency,
  BindingDiagnostic,
  BindingEvaluationResult
} from "./contracts.js";
import { BindingDependencyGraph, type BindingGraphSnapshot } from "./dependency-graph.js";
import { normalizeBindingDependencies } from "./dependencies.js";
import { evaluateDirectBinding, type DirectBindingDefinition } from "./direct.js";
import { evaluateExpressionBinding, type ExpressionBindingDefinition } from "./expression.js";
import {
  evaluateTransformedDirectBinding,
  evaluateTransformedExpressionBinding,
  hasBindingTransforms
} from "./transformed-evaluators.js";
import {
  normalizeBindingTarget,
  VisualPropertyResolver,
  type VisualTargetKind,
  type VisualPropertyCandidate,
  type VisualPropertyChangeSet,
  type VisualPropertyResolutionResult
} from "./visual-properties.js";

export interface RuntimeInputChangeSet {
  readonly revision: number;
  readonly changed: readonly BindingDependency[];
  readonly removed?: readonly BindingDependency[];
  readonly reset?: boolean;
}

export interface IncrementalEvaluationPlan {
  readonly graphRevision: number;
  readonly inputRevision: number;
  readonly changedDependencies: readonly BindingDependency[];
  readonly orderedBindingIds: readonly string[];
  readonly skippedCyclicBindingIds: readonly string[];
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface IncrementalEvaluationStatistics {
  readonly changedDependencyCount: number;
  readonly affectedBindingCount: number;
  readonly evaluatedBindingCount: number;
  readonly changedBindingCount: number;
  readonly unchangedBindingCount: number;
  readonly skippedBindingCount: number;
}

export interface IncrementalEvaluationResult {
  readonly revision: number;
  readonly graphRevision: number;
  readonly inputRevision: number;
  readonly plan: IncrementalEvaluationPlan;
  readonly evaluated: readonly BindingEvaluationResult[];
  readonly changed: readonly BindingEvaluationResult[];
  readonly visual: VisualPropertyResolutionResult;
  readonly visualDiff: VisualPropertyChangeSet;
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly statistics: IncrementalEvaluationStatistics;
}

export interface IncrementalEvaluationContext {
  readonly runtime: RuntimeSnapshot;
  /** Explicit locale keeps formatting deterministic. */
  readonly locale: string;
  readonly timestamp?: number;
}

export type IncrementalBindingEvaluationFunction = (
  definition: Readonly<BindingDefinition>,
  context: Readonly<IncrementalEvaluationContext>,
  bindingOutputs: ReadonlyMap<string, BindingEvaluationResult>
) => BindingEvaluationResult;

function engineDiagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  context: Readonly<Record<string, JsonValue>> = {}
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    recoverable: true,
    context: Object.freeze({ ...context })
  });
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => jsonEqual(entry, right[index]))
    );
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEqual(leftRecord[key], rightRecord[key])
    )
  );
}

/** Exact structural equality: Object.is primitives (including NaN/-0) and sorted JSON object keys. */
export function bindingEvaluationOutputsEqual(
  left: Readonly<BindingEvaluationResult> | undefined,
  right: Readonly<BindingEvaluationResult>
): boolean {
  return (
    left?.status === right.status &&
    jsonEqual(left.value, right.value) &&
    jsonEqual(left.diagnostics, right.diagnostics)
  );
}

function defaultEvaluate(
  definition: Readonly<BindingDefinition>,
  context: Readonly<IncrementalEvaluationContext>
): BindingEvaluationResult {
  if (definition.source.type === "tag")
    return hasBindingTransforms(definition)
      ? evaluateTransformedDirectBinding(definition as DirectBindingDefinition, context)
      : evaluateDirectBinding(definition as DirectBindingDefinition, context);
  if (definition.source.type === "expression")
    return hasBindingTransforms(definition)
      ? evaluateTransformedExpressionBinding(definition as ExpressionBindingDefinition, context)
      : evaluateExpressionBinding(definition as ExpressionBindingDefinition, context);
  return Object.freeze({
    bindingId: definition.id,
    status: "unresolved",
    target: Object.freeze({ ...definition.target }),
    dependencies: Object.freeze([]),
    diagnostics: Object.freeze([
      Object.freeze({
        code: "BINDING_UNKNOWN_TYPE",
        severity: "error",
        message: "Incremental evaluation does not support this binding source.",
        bindingId: definition.id,
        recoverable: true
      })
    ])
  });
}

export function runtimeChangeSetToBindingChanges(
  changes: Readonly<RuntimeChangeSet>
): RuntimeInputChangeSet {
  const changed = [...changes.addedKeys, ...changes.updatedKeys].map((key): BindingDependency =>
    Object.freeze({ kind: "runtime-value", key })
  );
  const removed = changes.removedKeys.map((key): BindingDependency =>
    Object.freeze({ kind: "runtime-value", key })
  );
  return Object.freeze({
    revision: changes.revision,
    changed: normalizeBindingDependencies(changed),
    removed: normalizeBindingDependencies(removed)
  });
}

/** Single-owner, synchronous evaluator. Calls are revision-checked and batches are atomic. */
export class IncrementalBindingEngine {
  readonly #graph: BindingDependencyGraph;
  readonly #evaluate: IncrementalBindingEvaluationFunction;
  readonly #visualResolver: VisualPropertyResolver;
  readonly #targetKind: (definition: Readonly<BindingDefinition>) => VisualTargetKind | undefined;
  #cache = new Map<string, BindingEvaluationResult>();
  #revision = 0;
  #inputRevision = -1;
  #disposed = false;

  public constructor(
    definitions: readonly Readonly<BindingDefinition>[],
    options: {
      readonly evaluate?: IncrementalBindingEvaluationFunction;
      readonly visualResolver?: VisualPropertyResolver;
      readonly targetKind?: (
        definition: Readonly<BindingDefinition>
      ) => VisualTargetKind | undefined;
    } = {}
  ) {
    this.#graph = new BindingDependencyGraph(definitions);
    this.#evaluate = options.evaluate ?? defaultEvaluate;
    this.#visualResolver = options.visualResolver ?? new VisualPropertyResolver();
    this.#targetKind = options.targetKind ?? (() => undefined);
  }

  public get graph(): BindingGraphSnapshot {
    return this.#graph.snapshot;
  }

  public createPlan(changes: Readonly<RuntimeInputChangeSet>): IncrementalEvaluationPlan {
    const normalized = normalizeBindingDependencies([
      ...changes.changed,
      ...(changes.removed ?? [])
    ]);
    const diagnostics: BindingDiagnostic[] = [];
    if (this.#disposed)
      diagnostics.push(engineDiagnostic("BINDING_ENGINE_DISPOSED", "Binding engine is disposed."));
    if (!Number.isSafeInteger(changes.revision) || changes.revision < 0)
      diagnostics.push(
        engineDiagnostic(
          "BINDING_REVISION_OUT_OF_ORDER",
          "Input revision must be a non-negative safe integer."
        )
      );
    if (changes.revision <= this.#inputRevision)
      diagnostics.push(
        engineDiagnostic("BINDING_REVISION_OUT_OF_ORDER", "Input revision is stale.", {
          currentInputRevision: this.#inputRevision,
          requestedInputRevision: changes.revision
        })
      );
    const order =
      diagnostics.length === 0
        ? this.#graph.affected(normalized, changes.reset === true || this.#cache.size === 0)
        : Object.freeze([]);
    return Object.freeze({
      graphRevision: this.#graph.snapshot.revision,
      inputRevision: changes.revision,
      changedDependencies: normalized,
      orderedBindingIds: order,
      skippedCyclicBindingIds: this.#graph.snapshot.cyclicBindingIds,
      diagnostics: Object.freeze([...this.#graph.snapshot.diagnostics, ...diagnostics])
    });
  }

  public evaluateAll(context: Readonly<IncrementalEvaluationContext>): IncrementalEvaluationResult {
    return this.evaluateChanges(context, {
      revision: Math.max(context.runtime.revision, this.#inputRevision + 1),
      changed: Object.freeze([]),
      reset: true
    });
  }

  public evaluateChanges(
    context: Readonly<IncrementalEvaluationContext>,
    changes: Readonly<RuntimeInputChangeSet>
  ): IncrementalEvaluationResult {
    const plan = this.createPlan(changes);
    const nextCache = new Map(this.#cache);
    const evaluated: BindingEvaluationResult[] = [];
    const changedResults: BindingEvaluationResult[] = [];
    const rejected = plan.diagnostics.some(
      (entry) =>
        entry.code === "BINDING_ENGINE_DISPOSED" || entry.code === "BINDING_REVISION_OUT_OF_ORDER"
    );
    if (!rejected) {
      for (const bindingId of plan.orderedBindingIds) {
        const definition = this.#graph.getDefinition(bindingId);
        if (definition === undefined) continue;
        try {
          const result = this.#evaluate(definition, context, nextCache);
          evaluated.push(result);
          if (!bindingEvaluationOutputsEqual(nextCache.get(bindingId), result))
            changedResults.push(result);
          nextCache.set(bindingId, result);
        } catch {
          const failure = Object.freeze({
            bindingId,
            status: "error" as const,
            target: Object.freeze({ ...definition.target }),
            dependencies: this.#graph.getDependencies(bindingId),
            diagnostics: Object.freeze([
              engineDiagnostic(
                "BINDING_INCREMENTAL_EVALUATION_FAILED",
                "Binding evaluation failed unexpectedly."
              )
            ])
          });
          evaluated.push(failure);
          /*
           * KEEP_LAST_VALID is the engine default. The failure remains observable in the
           * batch report, while a previous valid value continues to feed visual resolution
           * and downstream bindings. With no prior value the explicit error is retained.
           */
          if (!nextCache.has(bindingId)) {
            changedResults.push(failure);
            nextCache.set(bindingId, failure);
          }
        }
      }
    }
    const candidates: VisualPropertyCandidate[] = [];
    let declarationOrder = 0;
    for (const bindingId of this.#graph.snapshot.bindingIds) {
      const definition = this.#graph.getDefinition(bindingId);
      const result = nextCache.get(bindingId);
      if (definition === undefined || result === undefined) continue;
      const target = normalizeBindingTarget(definition.target, this.#targetKind(definition));
      if (target !== undefined)
        candidates.push(Object.freeze({ bindingId, target, result, declarationOrder }));
      declarationOrder += 1;
    }
    const visual = rejected
      ? Object.freeze({
          snapshot: this.#visualResolver.snapshot,
          changeSet: Object.freeze({
            previousRevision: this.#visualResolver.snapshot.revision,
            revision: this.#visualResolver.snapshot.revision,
            changes: Object.freeze([])
          }),
          diagnostics: Object.freeze([])
        })
      : this.#visualResolver.resolve(Object.freeze(candidates));
    if (plan.diagnostics.length === this.#graph.snapshot.diagnostics.length) {
      this.#cache = nextCache;
      this.#inputRevision = changes.revision;
      this.#revision += 1;
    }
    const statistics = Object.freeze({
      changedDependencyCount: plan.changedDependencies.length,
      affectedBindingCount: plan.orderedBindingIds.length,
      evaluatedBindingCount: evaluated.length,
      changedBindingCount: changedResults.length,
      unchangedBindingCount: evaluated.length - changedResults.length,
      skippedBindingCount: plan.skippedCyclicBindingIds.length
    });
    return Object.freeze({
      revision: this.#revision,
      graphRevision: plan.graphRevision,
      inputRevision: changes.revision,
      plan,
      evaluated: Object.freeze(evaluated),
      changed: Object.freeze(changedResults),
      visual,
      visualDiff: visual.changeSet,
      diagnostics: Object.freeze([
        ...plan.diagnostics,
        ...evaluated.flatMap((entry) => entry.diagnostics),
        ...visual.diagnostics
      ]),
      statistics
    });
  }

  public replaceBinding(definition: Readonly<BindingDefinition>): BindingGraphSnapshot {
    const downstream = this.#graph.getDownstream(definition.id);
    const snapshot = this.#graph.replace(definition);
    this.#cache.delete(definition.id);
    downstream.forEach((bindingId) => this.#cache.delete(bindingId));
    return snapshot;
  }

  public addBinding(definition: Readonly<BindingDefinition>): BindingGraphSnapshot {
    return this.#graph.add(definition);
  }

  public removeBinding(bindingId: string): BindingGraphSnapshot {
    const downstream = this.#graph.getDownstream(bindingId);
    const snapshot = this.#graph.remove(bindingId);
    this.#cache.delete(bindingId);
    downstream.forEach((id) => this.#cache.delete(id));
    return snapshot;
  }

  public reset(): void {
    this.#cache.clear();
    this.#visualResolver.reset();
    this.#inputRevision = -1;
    this.#revision = 0;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.reset();
    this.#disposed = true;
  }
}
