import type { Point } from "@web-scada/geometry";
import type { MoveCommandFactory } from "../commands/index.js";
import { DragDiagnostics } from "../diagnostics/drag-diagnostics.js";
import { DragError } from "../errors/index.js";
import type { PointerState } from "../pointer/index.js";
import { validateDragPolicies } from "../policies/index.js";
import { DragPreview } from "../preview/index.js";
import { TransformPipeline } from "../transform/index.js";
import type {
  DragCommitResult,
  DragConstraint,
  DragNode,
  DragPolicy,
  DragPreviewAdapter,
  DragState
} from "../types/drag.js";
import { InteractionSession } from "./base.js";

export interface DragSessionOptions {
  readonly pointer?: PointerState;
  readonly draggedIds?: readonly string[];
  readonly anchor?: Point;
  readonly viewportRevision?: number;
  readonly nodes: (ids: readonly string[]) => readonly DragNode[];
  readonly commandFactory: MoveCommandFactory;
  readonly policies?: readonly DragPolicy[];
  readonly constraints?: readonly DragConstraint[];
  readonly preview?: DragPreviewAdapter;
  readonly diagnostics?: DragDiagnostics;
  readonly readOnly?: boolean;
  readonly now?: () => number;
}

function freezeState(state: DragState): DragState {
  return Object.freeze({
    ...state,
    initialPointerPosition: Object.freeze({ ...state.initialPointerPosition }),
    currentPointerPosition: Object.freeze({ ...state.currentPointerPosition }),
    movementDelta: Object.freeze({ ...state.movementDelta }),
    anchorPosition: Object.freeze({ ...state.anchorPosition }),
    draggedIds: Object.freeze([...state.draggedIds])
  });
}

export class DragSession extends InteractionSession<PointerState, DragCommitResult> {
  readonly #options: Required<
    Pick<DragSessionOptions, "pointer" | "draggedIds" | "anchor" | "viewportRevision">
  > &
    DragSessionOptions;
  readonly #preview: DragPreview;
  readonly #pipeline: TransformPipeline;
  readonly #diagnostics: DragDiagnostics;
  #nodes: readonly DragNode[] = [];
  #state: DragState;

  public constructor(options: DragSessionOptions) {
    if (
      options.pointer === undefined ||
      options.draggedIds === undefined ||
      options.anchor === undefined ||
      options.viewportRevision === undefined
    )
      throw new DragError("DRAG_NOT_ACTIVE", "Session start state is required.");
    const draggedIds = [...new Set(options.draggedIds)].sort();
    if (draggedIds.length === 0)
      throw new DragError("DRAG_EMPTY_SELECTION", "At least one node must be dragged.");
    super(`drag-${options.pointer.id}`, "drag");
    this.#options = {
      ...options,
      pointer: options.pointer,
      draggedIds,
      anchor: options.anchor,
      viewportRevision: options.viewportRevision
    };
    this.#preview = new DragPreview(options.preview);
    this.#pipeline = new TransformPipeline(options.constraints);
    this.#diagnostics = options.diagnostics ?? new DragDiagnostics();
    const initial = options.pointer.coordinates.world;
    this.#state = freezeState({
      active: false,
      pointerId: options.pointer.id,
      initialPointerPosition: initial,
      currentPointerPosition: initial,
      movementDelta: { x: 0, y: 0 },
      draggedIds,
      anchorPosition: options.anchor,
      viewportRevision: options.viewportRevision,
      dragRevision: 0
    });
  }

  public get state(): DragState {
    return this.#state;
  }

  protected onStart(): void {
    this.#nodes = Object.freeze([...this.#options.nodes(this.#state.draggedIds)]);
    const policy = validateDragPolicies(this.#options.policies ?? [], {
      draggedIds: this.#state.draggedIds,
      nodes: this.#nodes,
      readOnly: this.#options.readOnly ?? false
    });
    if (!policy.allowed)
      throw new DragError("DRAG_POLICY_REJECTED", policy.message ?? "Drag policy rejected.");
    this.#state = freezeState({ ...this.#state, active: true });
    this.#diagnostics.start();
  }

  protected onUpdate(pointer: Readonly<PointerState>): void {
    if (pointer.id !== this.#state.pointerId)
      throw new DragError("DRAG_POINTER_MISMATCH", "Pointer does not own this drag session.");
    const started = this.#options.now?.() ?? Date.now();
    const revision = this.#state.dragRevision + 1;
    const result = this.#pipeline.calculate(
      {
        draggedIds: this.#state.draggedIds,
        nodes: this.#nodes,
        readOnly: this.#options.readOnly ?? false,
        initialPointer: this.#state.initialPointerPosition,
        currentPointer: pointer.coordinates.world
      },
      revision
    );
    const { temporaryTransform: previousTransform, ...stateWithoutTransform } = this.#state;
    void previousTransform;
    this.#state = freezeState({
      ...stateWithoutTransform,
      currentPointerPosition: pointer.coordinates.world,
      movementDelta: result.delta,
      dragRevision: revision,
      ...(result.transform === undefined ? {} : { temporaryTransform: result.transform })
    });
    if (result.transform === undefined) this.#preview.clear();
    else {
      this.#preview.update({ active: true, transform: result.transform });
      this.#diagnostics.recordPreview();
    }
    this.#diagnostics.recordUpdate(
      result.distance,
      (this.#options.now?.() ?? Date.now()) - started
    );
  }

  protected onCommit(): DragCommitResult {
    const transform = this.#state.temporaryTransform;
    this.#preview.clear();
    this.#state = freezeState({ ...this.#state, active: false });
    if (transform === undefined)
      return {
        nodeIds: this.#state.draggedIds,
        delta: this.#state.movementDelta,
        committed: false
      };
    const command = this.#options.commandFactory.create(transform.nodeIds, transform.delta);
    this.#diagnostics.recordCommand();
    return { command, nodeIds: transform.nodeIds, delta: transform.delta, committed: true };
  }

  protected onCancel(): void {
    this.#preview.clear();
    const { temporaryTransform, ...stateWithoutTransform } = this.#state;
    void temporaryTransform;
    this.#state = freezeState({
      ...stateWithoutTransform,
      active: false,
      movementDelta: { x: 0, y: 0 }
    });
  }
  protected onDispose(): void {
    this.#preview.clear();
    this.#nodes = [];
  }
}
