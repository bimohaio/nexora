import type { ScadaDocument } from "@web-scada/core";
import { intersectsRectangle, type Rectangle } from "@web-scada/geometry";
import type { SelectionMode, SelectionState } from "./contracts.js";

export const EMPTY_SELECTION: SelectionState = {
  selectedNodeIds: [],
  selectedConnectionIds: []
};

function applyMode(values: readonly string[], id: string, mode: SelectionMode): readonly string[] {
  const next = new Set(mode === "replace" ? [] : values);
  if (mode === "toggle" && next.has(id)) next.delete(id);
  else next.add(id);
  return [...next].sort();
}

export function selectNode(
  selection: SelectionState,
  nodeId: string,
  mode: SelectionMode
): SelectionState {
  return {
    selectedNodeIds: applyMode(selection.selectedNodeIds, nodeId, mode),
    selectedConnectionIds: mode === "replace" ? [] : selection.selectedConnectionIds
  };
}

export function selectConnection(
  selection: SelectionState,
  connectionId: string,
  mode: SelectionMode
): SelectionState {
  return {
    selectedNodeIds: mode === "replace" ? [] : selection.selectedNodeIds,
    selectedConnectionIds: applyMode(selection.selectedConnectionIds, connectionId, mode)
  };
}

export function selectNodesInRectangle(
  document: Readonly<ScadaDocument>,
  selection: SelectionState,
  bounds: Rectangle,
  mode: SelectionMode
): SelectionState {
  const ids = document.nodes
    .filter(({ visible, transform }) => visible && intersectsRectangle(transform, bounds))
    .map(({ id }) => id);
  if (mode === "replace") return { selectedNodeIds: ids.sort(), selectedConnectionIds: [] };
  const next = new Set(selection.selectedNodeIds);
  for (const id of ids) {
    if (mode === "toggle" && next.has(id)) next.delete(id);
    else next.add(id);
  }
  return { ...selection, selectedNodeIds: [...next].sort() };
}
