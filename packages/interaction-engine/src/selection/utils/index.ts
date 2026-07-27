import type { InteractionTarget } from "../../types/index.js";
import type { SelectionState } from "../state/index.js";
import { selectionKey } from "../state/index.js";

export function sameSelection(
  state: Readonly<SelectionState>,
  targets: readonly InteractionTarget[],
  primary?: InteractionTarget,
  activeTarget?: InteractionTarget
): boolean {
  if (state.selection.length !== targets.length) return false;
  if (
    !targets.every((target, index) => optionalKey(state.selection[index]) === selectionKey(target))
  )
    return false;
  return (
    optionalKey(state.primary) === optionalKey(primary) &&
    optionalKey(state.activeTarget) === optionalKey(activeTarget)
  );
}

export function uniqueTargets(targets: readonly InteractionTarget[]): readonly InteractionTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = selectionKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function optionalKey(target?: InteractionTarget): string | undefined {
  return target === undefined ? undefined : selectionKey(target);
}
