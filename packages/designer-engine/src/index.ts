import type { Command, ScadaDocument, ScadaDomainEvent } from "@web-scada/core";
import type { Point, Viewport } from "@web-scada/geometry";

export interface SelectionState {
  readonly selectedNodeIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
}

export interface DesignerState {
  readonly document: ScadaDocument;
  readonly selection: SelectionState;
  readonly viewport: Viewport;
}

export interface DesignerEngine {
  getState(): DesignerState;
  execute(command: Command): void;
  setSelection(selection: SelectionState): void;
  setViewport(viewport: Viewport): void;
  toCanvasPoint(screenPoint: Point): Point;
  subscribe(listener: (event: ScadaDomainEvent) => void): () => void;
}

export interface ClipboardAdapter {
  write(documentFragment: string): Promise<void>;
  read(): Promise<string>;
}
