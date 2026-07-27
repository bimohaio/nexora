import type { Point } from "@web-scada/geometry";

export type DragCoordinateSpace = "screen" | "viewport" | "canvas" | "world" | "local";

export interface DragNode {
  readonly id: string;
  readonly position: Point;
  readonly locked?: boolean;
  readonly visible?: boolean;
  readonly layerId?: string;
}

export interface TemporaryMoveTransform {
  readonly kind: "move";
  readonly delta: Point;
  readonly nodeIds: readonly string[];
  readonly revision: number;
}

export interface DragState {
  readonly active: boolean;
  readonly pointerId: number;
  readonly initialPointerPosition: Point;
  readonly currentPointerPosition: Point;
  readonly movementDelta: Point;
  readonly draggedIds: readonly string[];
  readonly anchorPosition: Point;
  readonly viewportRevision: number;
  readonly dragRevision: number;
  readonly temporaryTransform?: TemporaryMoveTransform;
}

export interface DragPreviewState {
  readonly active: boolean;
  readonly transform?: TemporaryMoveTransform;
}

export interface MoveCommandLike {
  readonly type: string;
}

export interface DragCommitResult {
  readonly command?: MoveCommandLike;
  readonly nodeIds: readonly string[];
  readonly delta: Point;
  readonly committed: boolean;
}

export interface DragPolicyContext {
  readonly draggedIds: readonly string[];
  readonly nodes: readonly DragNode[];
  readonly readOnly: boolean;
}

export interface DragValidationResult {
  readonly allowed: boolean;
  readonly code?: string;
  readonly message?: string;
}

export interface DragPolicy {
  readonly id: string;
  validate(context: Readonly<DragPolicyContext>): DragValidationResult;
}

export interface DragConstraintContext extends DragPolicyContext {
  readonly initialPointer: Point;
  readonly currentPointer: Point;
  readonly delta: Point;
}

export interface DragConstraint {
  readonly id: string;
  evaluate(context: Readonly<DragConstraintContext>): DragValidationResult;
}

export interface DragPreviewAdapter {
  update(state: Readonly<DragPreviewState>): void;
  clear(): void;
}

export interface DragDiagnosticsSnapshot {
  readonly enabled: boolean;
  readonly duration: number;
  readonly movementDistance: number;
  readonly updateCount: number;
  readonly previewUpdates: number;
  readonly commandCount: number;
  readonly totalFrameTime: number;
}
