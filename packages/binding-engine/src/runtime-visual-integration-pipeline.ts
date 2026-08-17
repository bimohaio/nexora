import type {
  AlarmInput,
  RuntimeScheduledTask,
  RuntimeTaskScheduler,
  RuntimeVisualSnapshot,
  RuntimeVisualSnapshotDiff
} from "@web-scada/runtime-engine";
import {
  composeAlarmVisualSnapshot,
  RuntimeAlarmEngine,
  RuntimeFrameScheduler
} from "@web-scada/runtime-engine";
import {
  RuntimeBindingRendererIntegration,
  type RuntimeBindingRendererIntegrationOptions,
  type RuntimeVisualRendererConsumer
} from "./runtime-renderer-integration.js";

export type RuntimeIntegrationStageKind = "alarm" | "animation";
export type RuntimeIntegrationReducedMotion = "reduce" | "no-preference";
export type RuntimeIntegrationVisibility = "visible" | "document-hidden";

export interface RuntimeVisualCommit {
  readonly snapshot: RuntimeVisualSnapshot;
  readonly diff: RuntimeVisualSnapshotDiff;
}

/** Snapshot-only extension point. Stages cannot access the runtime store or renderer. */
export interface RuntimeVisualIntegrationStage {
  readonly kind: RuntimeIntegrationStageKind;
  resolve(commit: Readonly<RuntimeVisualCommit>): Readonly<RuntimeVisualCommit>;
  setReducedMotion?(state: RuntimeIntegrationReducedMotion): void;
  setVisibility?(state: RuntimeIntegrationVisibility): void;
  dispose?(): void;
}

export interface RuntimeAlarmIntegrationStageOptions {
  readonly resolveInputs: (
    snapshot: RuntimeVisualSnapshot,
    diff: RuntimeVisualSnapshotDiff
  ) => readonly AlarmInput[];
  readonly engine?: RuntimeAlarmEngine;
}

/** Converts resolved binding output to alarm inputs and composes alarm state back into the snapshot. */
export class RuntimeAlarmIntegrationStage implements RuntimeVisualIntegrationStage {
  public readonly kind = "alarm" as const;
  readonly #engine: RuntimeAlarmEngine;
  readonly #ownsEngine: boolean;
  readonly #resolveInputs: RuntimeAlarmIntegrationStageOptions["resolveInputs"];

  public constructor(options: Readonly<RuntimeAlarmIntegrationStageOptions>) {
    this.#resolveInputs = options.resolveInputs;
    this.#ownsEngine = options.engine === undefined;
    this.#engine = options.engine ?? new RuntimeAlarmEngine();
  }

  public resolve(commit: Readonly<RuntimeVisualCommit>): Readonly<RuntimeVisualCommit> {
    const inputs = this.#resolveInputs(commit.snapshot, commit.diff);
    const result =
      inputs.length === 0
        ? { changed: false as const, snapshot: this.#engine.snapshot }
        : this.#engine.evaluateMany(inputs);
    const alarmDiff = result.diff;
    const updatedNodeIds = new Set(commit.diff.updatedNodeIds);
    const updatedConnectionIds = new Set(commit.diff.updatedConnectionIds);
    for (const id of alarmDiff?.changedSymbolIds ?? []) updatedNodeIds.add(id);
    for (const id of alarmDiff?.changedConnectionIds ?? []) updatedConnectionIds.add(id);
    return Object.freeze({
      snapshot: composeAlarmVisualSnapshot(commit.snapshot, result.snapshot),
      diff: Object.freeze({
        ...commit.diff,
        updatedNodeIds: Object.freeze([...updatedNodeIds].sort()),
        updatedConnectionIds: Object.freeze([...updatedConnectionIds].sort())
      })
    });
  }

  public dispose(): void {
    if (this.#ownsEngine) this.#engine.dispose();
  }
}

export interface RuntimeVisualIntegrationPipelineOptions extends Omit<
  RuntimeBindingRendererIntegrationOptions,
  "renderer"
> {
  readonly renderer: RuntimeVisualRendererConsumer;
  readonly alarm?: RuntimeVisualIntegrationStage;
  readonly animation?: RuntimeVisualIntegrationStage;
  readonly renderScheduler?: RuntimeTaskScheduler;
}

interface MutableDiff {
  fromRevision: number;
  addedNodeIds: Set<string>;
  updatedNodeIds: Set<string>;
  removedNodeIds: Set<string>;
  addedConnectionIds: Set<string>;
  updatedConnectionIds: Set<string>;
  removedConnectionIds: Set<string>;
  reset: boolean;
  changedNodeProperties: Map<string, Set<string>>;
  changedConnectionProperties: Map<string, Set<string>>;
}

function freezeProperties(
  values: Map<string, Set<string>>
): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, readonly string[]> = Object.create(null) as Record<
    string,
    readonly string[]
  >;
  for (const [id, properties] of [...values].sort(([left], [right]) => left.localeCompare(right)))
    result[id] = Object.freeze([...properties].sort());
  return Object.freeze(result);
}

function updateEntitySets(
  added: Set<string>,
  updated: Set<string>,
  removed: Set<string>,
  nextAdded: readonly string[],
  nextUpdated: readonly string[],
  nextRemoved: readonly string[]
): void {
  for (const id of nextAdded) {
    removed.delete(id);
    added.add(id);
  }
  for (const id of nextUpdated) if (!added.has(id) && !removed.has(id)) updated.add(id);
  for (const id of nextRemoved) {
    if (added.delete(id)) updated.delete(id);
    else {
      updated.delete(id);
      removed.add(id);
    }
  }
}

/**
 * Official Phase 10 execution boundary:
 * runtime snapshot -> bindings -> alarm -> animation -> frame batch -> renderer.
 */
export class RuntimeVisualIntegrationPipeline {
  readonly #renderer: RuntimeVisualRendererConsumer;
  readonly #stages: readonly RuntimeVisualIntegrationStage[];
  readonly #scheduler: RuntimeTaskScheduler;
  readonly #ownsScheduler: boolean;
  readonly #binding: RuntimeBindingRendererIntegration;
  #snapshot: RuntimeVisualSnapshot | undefined;
  #diff: MutableDiff | undefined;
  #task: RuntimeScheduledTask | undefined;
  #disposed = false;

  public constructor(options: Readonly<RuntimeVisualIntegrationPipelineOptions>) {
    this.#renderer = options.renderer;
    this.#stages = Object.freeze(
      [options.alarm, options.animation].filter(
        (stage): stage is RuntimeVisualIntegrationStage => stage !== undefined
      )
    );
    if (options.alarm !== undefined && options.alarm.kind !== "alarm")
      throw new TypeError("The alarm integration stage must have kind 'alarm'.");
    if (options.animation !== undefined && options.animation.kind !== "animation")
      throw new TypeError("The animation integration stage must have kind 'animation'.");
    this.#ownsScheduler = options.renderScheduler === undefined;
    this.#scheduler = options.renderScheduler ?? new RuntimeFrameScheduler();
    this.#binding = new RuntimeBindingRendererIntegration({
      document: options.document,
      store: options.store,
      renderer: {
        renderRuntimeChanges: (snapshot, diff) => {
          this.#enqueue(snapshot, diff);
        }
      },
      ...(options.locale === undefined ? {} : { locale: options.locale }),
      ...(options.schedulingMode === undefined ? {} : { schedulingMode: options.schedulingMode }),
      ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic })
    });
  }

  public get status(): RuntimeBindingRendererIntegration["status"] {
    return this.#binding.status;
  }

  public getSnapshot(): RuntimeVisualSnapshot {
    return this.#snapshot ?? this.#binding.getSnapshot();
  }

  public start(): void {
    if (!this.#disposed) this.#binding.start();
  }

  public stop(): void {
    this.#binding.stop();
    this.#cancelPending();
  }

  public flush(): void {
    if (this.#disposed) return;
    this.#binding.flush();
    this.#flushRenderer();
  }

  public attachDocument(document: RuntimeVisualIntegrationPipelineOptions["document"]): void {
    this.#binding.attachDocument(document);
  }

  public setReducedMotion(state: RuntimeIntegrationReducedMotion): void {
    for (const stage of this.#stages) stage.setReducedMotion?.(state);
  }

  public setVisibility(state: RuntimeIntegrationVisibility): void {
    for (const stage of this.#stages) stage.setVisibility?.(state);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#binding.dispose();
    this.#cancelPending();
    for (const stage of this.#stages) stage.dispose?.();
    if (this.#ownsScheduler) this.#scheduler.dispose();
    this.#disposed = true;
  }

  #enqueue(snapshot: RuntimeVisualSnapshot, diff: RuntimeVisualSnapshotDiff): void {
    if (this.#disposed) return;
    if (this.#diff === undefined) {
      this.#diff = {
        fromRevision: diff.fromRevision,
        addedNodeIds: new Set(),
        updatedNodeIds: new Set(),
        removedNodeIds: new Set(),
        addedConnectionIds: new Set(),
        updatedConnectionIds: new Set(),
        removedConnectionIds: new Set(),
        reset: false,
        changedNodeProperties: new Map(),
        changedConnectionProperties: new Map()
      };
    }
    const pending = this.#diff;
    this.#snapshot = snapshot;
    pending.reset ||= diff.reset;
    updateEntitySets(
      pending.addedNodeIds,
      pending.updatedNodeIds,
      pending.removedNodeIds,
      diff.addedNodeIds,
      diff.updatedNodeIds,
      diff.removedNodeIds
    );
    updateEntitySets(
      pending.addedConnectionIds,
      pending.updatedConnectionIds,
      pending.removedConnectionIds,
      diff.addedConnectionIds,
      diff.updatedConnectionIds,
      diff.removedConnectionIds
    );
    this.#mergeProperties(pending.changedNodeProperties, diff.changedNodeProperties);
    this.#mergeProperties(pending.changedConnectionProperties, diff.changedConnectionProperties);
    if (this.#task === undefined)
      this.#task = this.#scheduler.schedule(() => {
        this.#task = undefined;
        this.#flushRenderer();
      });
  }

  #flushRenderer(): void {
    if (this.#disposed || this.#snapshot === undefined || this.#diff === undefined) return;
    this.#task?.cancel();
    this.#task = undefined;
    const pending = this.#diff;
    let commit: Readonly<RuntimeVisualCommit> = Object.freeze({
      snapshot: this.#snapshot,
      diff: Object.freeze({
        fromRevision: pending.fromRevision,
        toRevision: this.#snapshot.revision,
        addedNodeIds: Object.freeze([...pending.addedNodeIds].sort()),
        updatedNodeIds: Object.freeze([...pending.updatedNodeIds].sort()),
        removedNodeIds: Object.freeze([...pending.removedNodeIds].sort()),
        addedConnectionIds: Object.freeze([...pending.addedConnectionIds].sort()),
        updatedConnectionIds: Object.freeze([...pending.updatedConnectionIds].sort()),
        removedConnectionIds: Object.freeze([...pending.removedConnectionIds].sort()),
        reset: pending.reset,
        ...(pending.changedNodeProperties.size === 0
          ? {}
          : { changedNodeProperties: freezeProperties(pending.changedNodeProperties) }),
        ...(pending.changedConnectionProperties.size === 0
          ? {}
          : { changedConnectionProperties: freezeProperties(pending.changedConnectionProperties) })
      })
    });
    this.#diff = undefined;
    for (const stage of this.#stages) commit = stage.resolve(commit);
    this.#snapshot = commit.snapshot;
    this.#renderer.renderRuntimeChanges(commit.snapshot, commit.diff);
  }

  #mergeProperties(
    target: Map<string, Set<string>>,
    source: Readonly<Record<string, readonly string[]>> | undefined
  ): void {
    if (source === undefined) return;
    for (const [id, properties] of Object.entries(source)) {
      const values = target.get(id) ?? new Set<string>();
      for (const property of properties) values.add(property);
      target.set(id, values);
    }
  }

  #cancelPending(): void {
    this.#task?.cancel();
    this.#task = undefined;
    this.#snapshot = undefined;
    this.#diff = undefined;
  }
}

export function createRuntimeVisualIntegrationPipeline(
  options: Readonly<RuntimeVisualIntegrationPipelineOptions>
): RuntimeVisualIntegrationPipeline {
  return new RuntimeVisualIntegrationPipeline(options);
}
