import type { InteractionModifiers } from "../../events/index.js";
import type { SelectionMode } from "../types/index.js";

export interface SelectionModeStrategy {
  modeFor(modifiers: Readonly<InteractionModifiers>): SelectionMode;
}

export class DefaultSelectionModeStrategy implements SelectionModeStrategy {
  public modeFor(modifiers: Readonly<InteractionModifiers>): SelectionMode {
    if (modifiers.control || modifiers.meta) return "toggle";
    if (modifiers.shift) return "add";
    return "replace";
  }
}
