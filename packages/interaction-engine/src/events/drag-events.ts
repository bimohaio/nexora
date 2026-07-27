import type { DragCommitResult, DragState } from "../types/drag.js";

export type DragEvent =
  | { readonly type: "drag-started"; readonly state: DragState }
  | { readonly type: "drag-updated"; readonly state: DragState }
  | { readonly type: "drag-committed"; readonly result: DragCommitResult }
  | { readonly type: "drag-canceled"; readonly reason?: string };

export type DragEventListener = (event: Readonly<DragEvent>) => void;
