import type { DragPreviewAdapter, DragPreviewState } from "../types/drag.js";

export class DragPreview {
  #state: DragPreviewState = Object.freeze({ active: false });
  public constructor(private readonly adapter?: DragPreviewAdapter) {}
  public get state(): DragPreviewState {
    return this.#state;
  }
  public update(state: DragPreviewState): void {
    this.#state = Object.freeze({ ...state });
    this.adapter?.update(this.#state);
  }
  public clear(): void {
    this.#state = Object.freeze({ active: false });
    this.adapter?.clear();
  }
}
