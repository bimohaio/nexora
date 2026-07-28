import type { JsonValue, ScadaDocument } from "@web-scada/core";
import type {
  DataQuality,
  MutableTagStore,
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  RuntimeStoreNotification,
  RuntimeSubscription,
  RuntimeVisualSnapshot,
  RuntimeVisualSnapshotDiff
} from "@web-scada/runtime-engine";
import {
  BindingEvaluationCoordinator,
  type BindingEvaluationCoordinatorOptions,
  type BindingExecutionReport
} from "./coordinator.js";
import type { BindingDiagnostic } from "./contracts.js";
import {
  getVisualTargetKey,
  type ResolvedTargetVisualState,
  type ResolvedVisualSnapshot,
  type VisualPropertyTarget
} from "./visual-properties.js";
import { runtimeChangeSetToBindingChanges } from "./incremental.js";

type SymbolState = NonNullable<ResolvedNodeVisualState["state"]>;

export type RuntimeBindingIntegrationStatus = "created" | "running" | "stopped" | "disposed";

export interface RuntimeVisualRendererConsumer {
  renderRuntimeChanges(snapshot: RuntimeVisualSnapshot, changes: RuntimeVisualSnapshotDiff): void;
}

/** Transient renderer-neutral state; `sourceRuntimeRevision` links it to normalized inputs. */
export interface RuntimeBindingVisualSnapshot extends RuntimeVisualSnapshot {
  readonly sourceRuntimeRevision: number;
}

export interface RuntimeBindingIntegrationDiagnostic {
  readonly code: "BINDING_INTEGRATION_EVALUATION_FAILED" | "BINDING_INTEGRATION_RENDERER_FAILED";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly recoverable: true;
  readonly cause?: unknown;
  readonly bindingDiagnostics: readonly BindingDiagnostic[];
}

export interface RuntimeBindingRendererIntegrationOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly store: MutableTagStore;
  readonly renderer?: RuntimeVisualRendererConsumer;
  readonly locale?: string;
  readonly schedulingMode?: BindingEvaluationCoordinatorOptions["schedulingMode"];
  readonly scheduler?: BindingEvaluationCoordinatorOptions["scheduler"];
  readonly now?: () => number;
  readonly onDiagnostic?: (diagnostic: RuntimeBindingIntegrationDiagnostic) => void;
}

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #source: ReadonlyMap<K, V>;
  public constructor(entries: Iterable<readonly [K, V]>) {
    this.#source = new Map(entries);
    Object.freeze(this);
  }
  public get size(): number {
    return this.#source.size;
  }
  public get(key: K): V | undefined {
    return this.#source.get(key);
  }
  public has(key: K): boolean {
    return this.#source.has(key);
  }
  public entries(): MapIterator<[K, V]> {
    return this.#source.entries();
  }
  public keys(): MapIterator<K> {
    return this.#source.keys();
  }
  public values(): MapIterator<V> {
    return this.#source.values();
  }
  public forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void): void {
    this.#source.forEach((value, key) => {
      callback(value, key, this);
    });
  }
  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#source[Symbol.iterator]();
  }
  public readonly [Symbol.toStringTag] = "ImmutableMapView";
}

const STATE_VALUES = new Set<SymbolState>([
  "normal",
  "active",
  "inactive",
  "running",
  "stopped",
  "warning",
  "alarm",
  "offline",
  "disabled"
]);
const QUALITY_ORDER: readonly DataQuality[] = ["good", "unknown", "uncertain", "bad", "offline"];

function targetKey(kind: "node" | "connection", targetId: string): string {
  return getVisualTargetKey({ kind, targetId, property: "" });
}

function splitProperties(
  target: ResolvedTargetVisualState | undefined
): Readonly<Record<string, JsonValue>> {
  if (target === undefined) return Object.freeze({});
  const properties: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(target.properties).sort())
    if (key !== "visible" && key !== "status")
      properties[key] = target.properties[key] as JsonValue;
  return Object.freeze(properties);
}

function worstQuality(qualities: readonly DataQuality[], fallback: DataQuality): DataQuality {
  const first = qualities[0];
  if (first === undefined) return fallback;
  return qualities.reduce(
    (worst, quality) =>
      QUALITY_ORDER.indexOf(quality) > QUALITY_ORDER.indexOf(worst) ? quality : worst,
    first
  );
}

class BindingVisualSnapshot implements RuntimeBindingVisualSnapshot {
  public readonly nodes: ReadonlyMap<string, ResolvedNodeVisualState>;
  public readonly connections: ReadonlyMap<string, ResolvedConnectionVisualState>;

  public constructor(
    public readonly revision: number,
    public readonly timestamp: number,
    public readonly sourceRuntimeRevision: number,
    document: Readonly<ScadaDocument>,
    visual: ResolvedVisualSnapshot,
    qualityForTarget: (target: VisualPropertyTarget) => DataQuality
  ) {
    this.nodes = new ImmutableMapView(
      document.nodes.map((node) => {
        const target = visual.targets.get(targetKey("node", node.id));
        const status = target?.properties.status;
        const state =
          typeof status === "string" && STATE_VALUES.has(status as SymbolState)
            ? (status as SymbolState)
            : undefined;
        const visible =
          typeof target?.properties.visible === "boolean" ? target.properties.visible : undefined;
        return [
          node.id,
          Object.freeze({
            properties: splitProperties(target),
            quality: qualityForTarget({ kind: "node", targetId: node.id, property: "" }),
            ...(state === undefined ? {} : { state }),
            ...(visible === undefined ? {} : { visible })
          })
        ] as const;
      })
    );
    this.connections = new ImmutableMapView(
      document.connections.map((connection) => {
        const target = visual.targets.get(targetKey("connection", connection.id));
        const visible =
          typeof target?.properties.visible === "boolean" ? target.properties.visible : undefined;
        return [
          connection.id,
          Object.freeze({
            style: splitProperties(target),
            quality: qualityForTarget({
              kind: "connection",
              targetId: connection.id,
              property: ""
            }),
            ...(visible === undefined ? {} : { visible })
          })
        ] as const;
      })
    );
    Object.freeze(this);
  }

  public getNodeState(id: string): SymbolState | undefined {
    return this.nodes.get(id)?.state;
  }
  public getNodeProperties(id: string): Readonly<Record<string, JsonValue>> | undefined {
    return this.nodes.get(id)?.properties;
  }
  public getNodeVisibility(id: string): boolean | undefined {
    return this.nodes.get(id)?.visible;
  }
  public getNodeQuality(id: string): DataQuality | undefined {
    return this.nodes.get(id)?.quality;
  }
  public getConnectionStyle(id: string): ResolvedConnectionVisualState["style"] | undefined {
    return this.connections.get(id)?.style;
  }
  public getConnectionVisibility(id: string): boolean | undefined {
    return this.connections.get(id)?.visible;
  }
  public getConnectionQuality(id: string): DataQuality | undefined {
    return this.connections.get(id)?.quality;
  }
}

function frozenSorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/** Owns the normalized-runtime -> binding -> renderer-neutral snapshot pipeline. */
export class RuntimeBindingRendererIntegration {
  readonly #store: MutableTagStore;
  readonly #localeOverride: string | undefined;
  readonly #coordinatorOptions: Pick<
    RuntimeBindingRendererIntegrationOptions,
    "schedulingMode" | "scheduler"
  >;
  readonly #now: () => number;
  readonly #onDiagnostic: RuntimeBindingRendererIntegrationOptions["onDiagnostic"];
  #document: Readonly<ScadaDocument>;
  #coordinator: BindingEvaluationCoordinator;
  #renderer: RuntimeVisualRendererConsumer | undefined;
  #subscription: RuntimeSubscription | undefined;
  #status: RuntimeBindingIntegrationStatus = "created";
  #revision = 0;
  #snapshot: RuntimeBindingVisualSnapshot;
  #lastVisual: ResolvedVisualSnapshot = Object.freeze({
    revision: 0,
    targets: new ImmutableMapView<string, ResolvedTargetVisualState>([])
  });

  public constructor(options: Readonly<RuntimeBindingRendererIntegrationOptions>) {
    this.#document = options.document;
    this.#store = options.store;
    this.#renderer = options.renderer;
    this.#localeOverride = options.locale;
    this.#coordinatorOptions = {
      ...(options.schedulingMode === undefined ? {} : { schedulingMode: options.schedulingMode }),
      ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler })
    };
    this.#now = options.now ?? (() => Date.now());
    this.#onDiagnostic = options.onDiagnostic;
    this.#coordinator = this.#createCoordinator();
    this.#snapshot = this.#buildSnapshot(this.#lastVisual);
  }

  public get status(): RuntimeBindingIntegrationStatus {
    return this.#status;
  }

  public getSnapshot(): RuntimeBindingVisualSnapshot {
    return this.#snapshot;
  }

  public start(): void {
    if (this.#status === "disposed" || this.#status === "running") return;
    this.#subscription = this.#store.subscribeChanges((notification) => {
      this.#handleStoreChange(notification);
    });
    this.#status = "running";
    const previousRevision = this.#revision;
    const runtime = this.#store.snapshot();
    const report = this.#coordinator.requestEvaluation({
      runtimeRevision: runtime.revision,
      context: { runtime, locale: this.#locale() },
      full: true,
      reason: "integration-start"
    });
    this.#consume(report);
    if (report.result === undefined) this.flush();
    if (this.#revision === previousRevision)
      this.#applyRenderer(this.#snapshot, {
        fromRevision: 0,
        toRevision: this.#snapshot.revision,
        addedNodeIds: frozenSorted(this.#snapshot.nodes.keys()),
        updatedNodeIds: Object.freeze([]),
        removedNodeIds: Object.freeze([]),
        addedConnectionIds: frozenSorted(this.#snapshot.connections.keys()),
        updatedConnectionIds: Object.freeze([]),
        removedConnectionIds: Object.freeze([]),
        reset: true
      });
  }

  public stop(): void {
    if (this.#status !== "running") return;
    this.#subscription?.unsubscribe();
    this.#subscription = undefined;
    this.#coordinator.cancelScheduled();
    this.#status = "stopped";
  }

  public flush(): void {
    if (this.#status !== "running") return;
    this.#consume(this.#coordinator.flush());
  }

  public attachRenderer(renderer: RuntimeVisualRendererConsumer): void {
    if (this.#status === "disposed") return;
    this.#renderer = renderer;
    this.#applyRenderer(this.#snapshot, {
      fromRevision: 0,
      toRevision: this.#snapshot.revision,
      addedNodeIds: frozenSorted(this.#snapshot.nodes.keys()),
      updatedNodeIds: Object.freeze([]),
      removedNodeIds: Object.freeze([]),
      addedConnectionIds: frozenSorted(this.#snapshot.connections.keys()),
      updatedConnectionIds: Object.freeze([]),
      removedConnectionIds: Object.freeze([]),
      reset: true
    });
  }

  public detachRenderer(): void {
    this.#renderer = undefined;
  }

  public attachDocument(document: Readonly<ScadaDocument>): void {
    if (this.#status === "disposed" || document === this.#document) return;
    const wasRunning = this.#status === "running";
    const previous = this.#snapshot;
    this.#coordinator.dispose();
    this.#document = document;
    this.#lastVisual = Object.freeze({
      revision: 0,
      targets: new ImmutableMapView<string, ResolvedTargetVisualState>([])
    });
    this.#coordinator = this.#createCoordinator();
    if (!wasRunning) {
      this.#snapshot = this.#buildSnapshot(this.#lastVisual);
      return;
    }
    const runtime = this.#store.snapshot();
    const report = this.#coordinator.requestEvaluation({
      runtimeRevision: runtime.revision,
      context: { runtime, locale: this.#locale() },
      full: true,
      reason: "document-replacement"
    });
    this.#consume(report.result === undefined ? this.#coordinator.flush() : report, previous);
  }

  public dispose(): void {
    if (this.#status === "disposed") return;
    this.#subscription?.unsubscribe();
    this.#subscription = undefined;
    this.#coordinator.dispose();
    this.#renderer = undefined;
    this.#status = "disposed";
  }

  #createCoordinator(): BindingEvaluationCoordinator {
    const options: BindingEvaluationCoordinatorOptions = {
      onOutcome: (outcome) => {
        this.#consume(outcome);
      },
      targetKind: (definition) => {
        const target = definition.target;
        if (target.type !== "visibility") return undefined;
        return this.#document.connections.some(({ id }) => id === target.entityId)
          ? "connection"
          : "node";
      },
      ...(this.#coordinatorOptions.schedulingMode === undefined
        ? {}
        : { schedulingMode: this.#coordinatorOptions.schedulingMode }),
      ...(this.#coordinatorOptions.scheduler === undefined
        ? {}
        : { scheduler: this.#coordinatorOptions.scheduler })
    };
    return new BindingEvaluationCoordinator(this.#document.bindings, {
      ...options
    });
  }

  #locale(): string {
    return this.#localeOverride ?? this.#document.runtimeSettings.locale ?? "en-US";
  }

  #handleStoreChange(notification: RuntimeStoreNotification): void {
    if (this.#status !== "running") return;
    const inputs = runtimeChangeSetToBindingChanges(notification.changes);
    const report = this.#coordinator.requestEvaluation({
      runtimeRevision: notification.snapshot.revision,
      context: { runtime: notification.snapshot, locale: this.#locale() },
      changedInputs: [...inputs.changed, ...(inputs.removed ?? [])],
      reason: "runtime-change"
    });
    this.#consume(report);
  }

  #consume(report: BindingExecutionReport, previousOverride?: RuntimeVisualSnapshot): void {
    if (this.#status === "disposed" || report.result === undefined) return;
    const previous = previousOverride ?? this.#snapshot;
    const visual = report.result.visual.snapshot;
    const changedNodeIds = new Set<string>();
    const changedConnectionIds = new Set<string>();
    for (const change of report.result.visualDiff.changes)
      (change.targetKind === "node" ? changedNodeIds : changedConnectionIds).add(change.targetId);
    const documentReplaced = previousOverride !== undefined;
    const previousNodeIds = new Set(previous.nodes.keys());
    const previousConnectionIds = new Set(previous.connections.keys());
    const currentNodeIds = new Set(this.#document.nodes.map(({ id }) => id));
    const currentConnectionIds = new Set(this.#document.connections.map(({ id }) => id));
    const removedNodeIds = [...previousNodeIds].filter((id) => !currentNodeIds.has(id));
    const removedConnectionIds = [...previousConnectionIds].filter(
      (id) => !currentConnectionIds.has(id)
    );
    if (
      !documentReplaced &&
      changedNodeIds.size === 0 &&
      changedConnectionIds.size === 0 &&
      removedNodeIds.length === 0 &&
      removedConnectionIds.length === 0
    ) {
      this.#lastVisual = visual;
      return;
    }
    this.#revision += 1;
    this.#lastVisual = visual;
    this.#snapshot = this.#buildSnapshot(visual);
    const diff: RuntimeVisualSnapshotDiff = Object.freeze({
      fromRevision: previous.revision,
      toRevision: this.#snapshot.revision,
      addedNodeIds: documentReplaced
        ? frozenSorted([...currentNodeIds].filter((id) => !previousNodeIds.has(id)))
        : Object.freeze([]),
      updatedNodeIds: documentReplaced
        ? frozenSorted([...currentNodeIds].filter((id) => previousNodeIds.has(id)))
        : frozenSorted(changedNodeIds),
      removedNodeIds: frozenSorted(removedNodeIds),
      addedConnectionIds: documentReplaced
        ? frozenSorted([...currentConnectionIds].filter((id) => !previousConnectionIds.has(id)))
        : Object.freeze([]),
      updatedConnectionIds: documentReplaced
        ? frozenSorted([...currentConnectionIds].filter((id) => previousConnectionIds.has(id)))
        : frozenSorted(changedConnectionIds),
      removedConnectionIds: frozenSorted(removedConnectionIds),
      reset: documentReplaced
    });
    this.#applyRenderer(this.#snapshot, diff);
  }

  #buildSnapshot(visual: ResolvedVisualSnapshot): RuntimeBindingVisualSnapshot {
    const qualityByTarget = new Map<string, DataQuality[]>();
    for (const binding of this.#document.bindings) {
      const bindingTarget = binding.target;
      const normalized =
        bindingTarget.type === "connection-property"
          ? { kind: "connection" as const, targetId: bindingTarget.connectionId, property: "" }
          : bindingTarget.type === "visibility"
            ? {
                kind: this.#document.connections.some(({ id }) => id === bindingTarget.entityId)
                  ? ("connection" as const)
                  : ("node" as const),
                targetId: bindingTarget.entityId,
                property: ""
              }
            : { kind: "node" as const, targetId: bindingTarget.nodeId, property: "" };
      const key = targetKey(normalized.kind, normalized.targetId);
      const qualities = qualityByTarget.get(key) ?? [];
      if (binding.source.type === "tag") {
        const quality = this.#store.getDataPoint(binding.source.tagId)?.quality;
        if (quality !== undefined) qualities.push(quality);
      }
      qualityByTarget.set(key, qualities);
    }
    return new BindingVisualSnapshot(
      this.#revision,
      this.#now(),
      this.#store.revision,
      this.#document,
      visual,
      (target) =>
        worstQuality(
          qualityByTarget.get(targetKey(target.kind, target.targetId)) ?? [],
          this.#document.runtimeSettings.defaultQuality
        )
    );
  }

  #applyRenderer(snapshot: RuntimeVisualSnapshot, diff: RuntimeVisualSnapshotDiff): void {
    if (this.#renderer === undefined || this.#status === "disposed") return;
    try {
      this.#renderer.renderRuntimeChanges(snapshot, diff);
    } catch (cause) {
      this.#diagnostic({
        code: "BINDING_INTEGRATION_RENDERER_FAILED",
        severity: "error",
        message: "Renderer rejected a resolved runtime visual commit.",
        recoverable: true,
        cause,
        bindingDiagnostics: Object.freeze([])
      });
    }
  }

  #diagnostic(diagnostic: RuntimeBindingIntegrationDiagnostic): void {
    try {
      this.#onDiagnostic?.(Object.freeze(diagnostic));
    } catch {
      // Diagnostic consumers are isolated from integration state.
    }
  }
}

export function createRuntimeBindingRendererIntegration(
  options: Readonly<RuntimeBindingRendererIntegrationOptions>
): RuntimeBindingRendererIntegration {
  return new RuntimeBindingRendererIntegration(options);
}
