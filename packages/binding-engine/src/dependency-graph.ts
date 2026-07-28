import type { JsonValue } from "@web-scada/core";
import type { BindingDefinition, BindingDependency, BindingDiagnostic } from "./contracts.js";
import {
  getBindingDependencies,
  getBindingDependencyKey,
  normalizeBindingDependencies
} from "./dependencies.js";
import { compileExpression } from "./expression.js";

export interface BindingDependencyExtraction {
  readonly bindingId: string;
  readonly dependencies: readonly BindingDependency[];
  readonly diagnostics: readonly BindingDiagnostic[];
}

export type BindingDependencyExtractor = (
  definition: Readonly<BindingDefinition>
) => BindingDependencyExtraction;

export interface BindingGraphLimits {
  readonly maximumBindings: number;
  readonly maximumDependenciesPerBinding: number;
  readonly maximumEdges: number;
  readonly maximumCyclePathLength: number;
}

export const DEFAULT_BINDING_GRAPH_LIMITS: Readonly<BindingGraphLimits> = Object.freeze({
  maximumBindings: 10_000,
  maximumDependenciesPerBinding: 256,
  maximumEdges: 50_000,
  maximumCyclePathLength: 128
});

function diagnostic(
  code: BindingDiagnostic["code"],
  message: string,
  bindingId?: string,
  context: Readonly<Record<string, JsonValue>> = {}
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    recoverable: true,
    ...(bindingId === undefined ? {} : { bindingId }),
    context: Object.freeze({ ...context })
  });
}

export function extractBindingDependencies(
  definition: Readonly<BindingDefinition>
): BindingDependencyExtraction {
  let dependencies = getBindingDependencies(definition);
  const diagnostics: BindingDiagnostic[] = [];
  if (definition.source.type === "expression") {
    const compiled = compileExpression(definition.source.expression, {
      ...(definition.source.language === undefined ? {} : { language: definition.source.language })
    });
    if (compiled.success) dependencies = compiled.compiled.dependencies;
    else
      diagnostics.push(
        ...compiled.diagnostics.map((entry) =>
          Object.freeze({ ...entry, bindingId: definition.id })
        )
      );
  }
  for (const dependency of dependencies) {
    const identifier =
      dependency.kind === "runtime-value" || dependency.kind === "environment"
        ? dependency.key
        : dependency.kind === "binding"
          ? dependency.bindingId
          : dependency.propertyKey;
    if (identifier.trim() === "")
      diagnostics.push(
        diagnostic(
          "BINDING_DEPENDENCY_INVALID_KEY",
          "Dependency identifiers must be non-empty.",
          definition.id
        )
      );
  }
  return Object.freeze({
    bindingId: definition.id,
    dependencies: normalizeBindingDependencies(dependencies),
    diagnostics: Object.freeze(diagnostics)
  });
}

export interface BindingGraphSnapshot {
  readonly revision: number;
  readonly bindingIds: readonly string[];
  readonly edgeCount: number;
  readonly cyclicBindingIds: readonly string[];
  readonly topologicalBindingIds: readonly string[];
  readonly diagnostics: readonly BindingDiagnostic[];
}

/** Instance-owned dependency graph. Returned collections are immutable snapshots. */
export class BindingDependencyGraph {
  #revision = 0;
  #definitions = new Map<string, Readonly<BindingDefinition>>();
  #dependencies = new Map<string, readonly BindingDependency[]>();
  #reverse = new Map<string, Set<string>>();
  #downstream = new Map<string, Set<string>>();
  #snapshot: BindingGraphSnapshot;
  readonly #limits: Readonly<BindingGraphLimits>;
  readonly #extract: BindingDependencyExtractor;

  public constructor(
    definitions: readonly Readonly<BindingDefinition>[] = [],
    limits?: Readonly<BindingGraphLimits>,
    extractor: BindingDependencyExtractor = extractBindingDependencies
  ) {
    this.#limits = Object.freeze({ ...(limits ?? DEFAULT_BINDING_GRAPH_LIMITS) });
    this.#extract = extractor;
    this.#snapshot = Object.freeze({
      revision: 0,
      bindingIds: Object.freeze([]),
      edgeCount: 0,
      cyclicBindingIds: Object.freeze([]),
      topologicalBindingIds: Object.freeze([]),
      diagnostics: Object.freeze([])
    });
    this.rebuild(definitions);
  }

  public get snapshot(): BindingGraphSnapshot {
    return this.#snapshot;
  }

  public getDefinition(bindingId: string): Readonly<BindingDefinition> | undefined {
    return this.#definitions.get(bindingId);
  }

  public getDependencies(bindingId: string): readonly BindingDependency[] {
    return this.#dependencies.get(bindingId) ?? Object.freeze([]);
  }

  public getDirectConsumers(dependency: Readonly<BindingDependency>): readonly string[] {
    return Object.freeze(
      [...(this.#reverse.get(getBindingDependencyKey(dependency)) ?? [])].sort()
    );
  }

  public getDownstream(bindingId: string): readonly string[] {
    return Object.freeze([...(this.#downstream.get(bindingId) ?? [])].sort());
  }

  public rebuild(definitions: readonly Readonly<BindingDefinition>[]): BindingGraphSnapshot {
    const nextDefinitions = new Map<string, Readonly<BindingDefinition>>();
    const nextDependencies = new Map<string, readonly BindingDependency[]>();
    const diagnostics: BindingDiagnostic[] = [];
    const ordered = [...definitions].sort((left, right) => left.id.localeCompare(right.id));
    if (ordered.length > this.#limits.maximumBindings)
      diagnostics.push(
        diagnostic(
          "BINDING_GRAPH_LIMIT_EXCEEDED",
          "Binding count exceeds the configured limit.",
          undefined,
          {
            maximumBindings: this.#limits.maximumBindings
          }
        )
      );
    for (const definition of ordered.slice(0, this.#limits.maximumBindings)) {
      if (nextDefinitions.has(definition.id)) {
        diagnostics.push(
          diagnostic("BINDING_DUPLICATE_ID", "Duplicate binding ID was ignored.", definition.id)
        );
        continue;
      }
      const extraction = this.#extract(definition);
      diagnostics.push(...extraction.diagnostics);
      if (extraction.dependencies.length > this.#limits.maximumDependenciesPerBinding) {
        diagnostics.push(
          diagnostic(
            "BINDING_GRAPH_LIMIT_EXCEEDED",
            "Binding dependency count exceeds the configured limit.",
            definition.id,
            { maximumDependenciesPerBinding: this.#limits.maximumDependenciesPerBinding }
          )
        );
        continue;
      }
      nextDefinitions.set(definition.id, definition);
      nextDependencies.set(definition.id, extraction.dependencies);
    }
    this.#definitions = nextDefinitions;
    this.#dependencies = nextDependencies;
    this.#revision += 1;
    this.#reindex(diagnostics);
    return this.#snapshot;
  }

  public add(definition: Readonly<BindingDefinition>): BindingGraphSnapshot {
    return this.rebuild([...this.#definitions.values(), definition]);
  }

  public replace(definition: Readonly<BindingDefinition>): BindingGraphSnapshot {
    return this.rebuild([
      ...[...this.#definitions.values()].filter(({ id }) => id !== definition.id),
      definition
    ]);
  }

  public remove(bindingId: string): BindingGraphSnapshot {
    return this.rebuild([...this.#definitions.values()].filter(({ id }) => id !== bindingId));
  }

  public affected(
    changed: readonly Readonly<BindingDependency>[],
    reset = false
  ): readonly string[] {
    if (reset) return this.#snapshot.topologicalBindingIds;
    const affected = new Set<string>();
    const queue = normalizeBindingDependencies(changed).flatMap((dependency) =>
      [...(this.#reverse.get(getBindingDependencyKey(dependency)) ?? [])].sort()
    );
    for (const bindingId of queue) {
      if (affected.has(bindingId)) continue;
      affected.add(bindingId);
      for (const consumer of [...(this.#downstream.get(bindingId) ?? [])].sort())
        if (!affected.has(consumer)) queue.push(consumer);
    }
    return Object.freeze(
      this.#snapshot.topologicalBindingIds.filter((bindingId) => affected.has(bindingId))
    );
  }

  #reindex(diagnostics: BindingDiagnostic[]): void {
    this.#reverse = new Map();
    this.#downstream = new Map();
    let edgeCount = 0;
    for (const [bindingId, dependencies] of this.#dependencies) {
      for (const dependency of dependencies) {
        edgeCount += 1;
        if (edgeCount > this.#limits.maximumEdges) {
          diagnostics.push(
            diagnostic(
              "BINDING_GRAPH_LIMIT_EXCEEDED",
              "Graph edge count exceeds the configured limit."
            )
          );
          break;
        }
        const key = getBindingDependencyKey(dependency);
        const consumers = this.#reverse.get(key) ?? new Set<string>();
        consumers.add(bindingId);
        this.#reverse.set(key, consumers);
        if (dependency.kind === "binding") {
          if (!this.#definitions.has(dependency.bindingId))
            diagnostics.push(
              diagnostic(
                "BINDING_DEPENDENCY_UNRESOLVED",
                "Referenced binding output does not exist.",
                bindingId,
                { dependencyBindingId: dependency.bindingId }
              )
            );
          const downstream = this.#downstream.get(dependency.bindingId) ?? new Set<string>();
          downstream.add(bindingId);
          this.#downstream.set(dependency.bindingId, downstream);
        }
      }
    }
    const indegree = new Map([...this.#definitions.keys()].map((id) => [id, 0]));
    for (const [upstream, consumers] of this.#downstream)
      if (this.#definitions.has(upstream))
        for (const consumer of consumers) indegree.set(consumer, (indegree.get(consumer) ?? 0) + 1);
    const ready = [...indegree]
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id)
      .sort();
    const topological: string[] = [];
    while (ready.length > 0) {
      const bindingId = ready.shift();
      if (bindingId === undefined) break;
      topological.push(bindingId);
      for (const consumer of [...(this.#downstream.get(bindingId) ?? [])].sort()) {
        const next = (indegree.get(consumer) ?? 0) - 1;
        indegree.set(consumer, next);
        if (next === 0) {
          ready.push(consumer);
          ready.sort();
        }
      }
    }
    const cyclic = [...indegree]
      .filter(([, degree]) => degree > 0)
      .map(([id]) => id)
      .sort();
    if (cyclic.length > 0)
      diagnostics.push(
        diagnostic(
          "BINDING_DEPENDENCY_CYCLE",
          "Binding-output dependency cycle detected.",
          cyclic[0],
          {
            bindingIds: cyclic.slice(0, this.#limits.maximumCyclePathLength)
          }
        )
      );
    this.#snapshot = Object.freeze({
      revision: this.#revision,
      bindingIds: Object.freeze([...this.#definitions.keys()].sort()),
      edgeCount: Math.min(edgeCount, this.#limits.maximumEdges),
      cyclicBindingIds: Object.freeze(cyclic),
      topologicalBindingIds: Object.freeze(topological),
      diagnostics: Object.freeze(
        diagnostics.sort(
          (left, right) =>
            (left.bindingId ?? "").localeCompare(right.bindingId ?? "") ||
            left.code.localeCompare(right.code)
        )
      )
    });
  }
}
