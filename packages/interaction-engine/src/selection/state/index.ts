import type { InteractionTarget } from "../../types/index.js";
import type { SelectionMode, SelectionSource } from "../types/index.js";

export interface SelectionState {
  readonly selectedIds: ReadonlySet<string>;
  readonly selection: readonly InteractionTarget[];
  readonly primary?: InteractionTarget;
  readonly activeTarget?: InteractionTarget;
  readonly order: readonly string[];
  readonly revision: number;
  readonly mode: SelectionMode;
  readonly source: SelectionSource;
}

export function selectionKey(target: Readonly<InteractionTarget>): string {
  return `${target.kind}:${target.id}`;
}

export function createSelectionState(init: Partial<SelectionState> = {}): SelectionState {
  const selection = Object.freeze([...(init.selection ?? [])]);
  const order = Object.freeze(
    init.order === undefined ? selection.map(selectionKey) : [...init.order]
  );
  return Object.freeze({
    selectedIds: new Set(init.selectedIds ?? order),
    selection,
    order,
    revision: init.revision ?? 0,
    mode: init.mode ?? "replace",
    source: init.source ?? "api",
    ...(init.primary === undefined ? {} : { primary: init.primary }),
    ...(init.activeTarget === undefined ? {} : { activeTarget: init.activeTarget })
  });
}

export const EMPTY_SELECTION_STATE = createSelectionState();
