import type {
  RuntimeEngineEvent,
  RuntimeScheduledTask,
  RuntimeTaskScheduler,
  RuntimeVisualSnapshot,
  RuntimeVisualSnapshotDiff
} from "./contracts.js";
import { RuntimeFrameScheduler } from "./dispatch.js";
import type { RuntimeEventBus } from "./events.js";

export interface RuntimeCommitSource {
  subscribe(listener: (event: RuntimeEngineEvent) => void): () => void;
}

export interface RuntimeIncrementalRenderer {
  renderRuntimeChanges(snapshot: RuntimeVisualSnapshot, diff: RuntimeVisualSnapshotDiff): void;
}

export interface RuntimeRenderPipelineOptions {
  readonly source: RuntimeCommitSource;
  readonly renderer: RuntimeIncrementalRenderer;
  readonly scheduler?: RuntimeTaskScheduler;
  readonly events?: RuntimeEventBus;
  readonly now?: () => number;
}

/** Connects visual commits to a renderer and coalesces them at the animation-frame boundary. */
export class RuntimeRenderPipeline {
  readonly #renderer: RuntimeIncrementalRenderer;
  readonly #scheduler: RuntimeTaskScheduler;
  readonly #ownsScheduler: boolean;
  readonly #events: RuntimeEventBus | undefined;
  readonly #now: () => number;
  readonly #unsubscribe: () => void;
  readonly #nodeIds = new Set<string>();
  readonly #connectionIds = new Set<string>();
  #task: RuntimeScheduledTask | undefined;
  #snapshot: RuntimeVisualSnapshot | undefined;
  #fromRevision = 0;
  #reset = false;
  #disposed = false;

  public constructor(options: RuntimeRenderPipelineOptions) {
    this.#renderer = options.renderer;
    this.#ownsScheduler = options.scheduler === undefined;
    this.#scheduler = options.scheduler ?? new RuntimeFrameScheduler();
    this.#events = options.events;
    this.#now = options.now ?? (() => Date.now());
    this.#unsubscribe = options.source.subscribe((event) => {
      if (event.type === "values")
        this.#enqueue(event.visualCommit.snapshot, event.visualCommit.diff);
    });
  }

  public flush(): void {
    if (this.#disposed || this.#snapshot === undefined) return;
    this.#task?.cancel();
    this.#task = undefined;
    const snapshot = this.#snapshot;
    const nodeIds = Object.freeze([...this.#nodeIds]);
    const connectionIds = Object.freeze([...this.#connectionIds]);
    const diff: RuntimeVisualSnapshotDiff = Object.freeze({
      fromRevision: this.#fromRevision,
      toRevision: snapshot.revision,
      addedNodeIds: Object.freeze([]),
      updatedNodeIds: nodeIds,
      removedNodeIds: Object.freeze([]),
      addedConnectionIds: Object.freeze([]),
      updatedConnectionIds: connectionIds,
      removedConnectionIds: Object.freeze([]),
      reset: this.#reset
    });
    this.#snapshot = undefined;
    this.#nodeIds.clear();
    this.#connectionIds.clear();
    this.#reset = false;
    this.#events?.emit("RenderStarted", {
      revision: snapshot.revision,
      timestamp: this.#now()
    });
    this.#renderer.renderRuntimeChanges(snapshot, diff);
    this.#events?.emit("RenderCompleted", {
      revision: snapshot.revision,
      timestamp: this.#now(),
      updatedSymbols: nodeIds.length + connectionIds.length
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#unsubscribe();
    this.#task?.cancel();
    if (this.#ownsScheduler) this.#scheduler.dispose();
    this.#snapshot = undefined;
    this.#nodeIds.clear();
    this.#connectionIds.clear();
    this.#disposed = true;
  }

  #enqueue(snapshot: RuntimeVisualSnapshot, diff: RuntimeVisualSnapshotDiff): void {
    if (this.#disposed) return;
    this.#events?.emit("SnapshotChanged", {
      previousRevision: diff.fromRevision,
      revision: snapshot.revision,
      timestamp: snapshot.timestamp
    });
    if (this.#snapshot === undefined) this.#fromRevision = diff.fromRevision;
    this.#snapshot = snapshot;
    this.#reset ||= diff.reset;
    for (const id of [...diff.addedNodeIds, ...diff.updatedNodeIds, ...diff.removedNodeIds])
      this.#nodeIds.add(id);
    for (const id of [
      ...diff.addedConnectionIds,
      ...diff.updatedConnectionIds,
      ...diff.removedConnectionIds
    ])
      this.#connectionIds.add(id);
    if (this.#task === undefined)
      this.#task = this.#scheduler.schedule(() => {
        this.#task = undefined;
        this.flush();
      });
  }
}

export function createRuntimeRenderPipeline(
  options: RuntimeRenderPipelineOptions
): RuntimeRenderPipeline {
  return new RuntimeRenderPipeline(options);
}
