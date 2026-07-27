import type { InteractionTarget } from "../../types/index.js";
import type { SelectionState } from "../state/index.js";

export type SelectionEventType =
  | "selection-changing"
  | "selection-changed"
  | "selection-cleared"
  | "selection-added"
  | "selection-removed"
  | "primary-selection-changed";

export interface SelectionEvent {
  readonly type: SelectionEventType;
  readonly previous: SelectionState;
  readonly state: SelectionState;
  readonly added: readonly InteractionTarget[];
  readonly removed: readonly InteractionTarget[];
}

export class SelectionChangingEvent implements SelectionEvent {
  public readonly type = "selection-changing";
  #cancelled = false;
  public constructor(
    public readonly previous: SelectionState,
    public readonly state: SelectionState,
    public readonly added: readonly InteractionTarget[],
    public readonly removed: readonly InteractionTarget[]
  ) {}
  public get cancelled(): boolean {
    return this.#cancelled;
  }
  public cancel(): void {
    this.#cancelled = true;
  }
}
