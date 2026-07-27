import type { FocusEngine } from "./index.js";
import type { AccessibilityNode } from "../types/accessibility.js";
import type { FocusState, FocusTarget } from "../types/keyboard.js";

export interface FocusRingStyle {
  readonly visible: boolean;
  readonly token: string;
  readonly width: number;
  readonly offset: number;
}

export class AccessibilityFocusManager {
  #previous: FocusTarget | undefined;
  public constructor(private readonly focus: FocusEngine) {}
  public synchronize(nodes: readonly AccessibilityNode[]): FocusState {
    const targets: FocusTarget[] = nodes
      .filter(({ focusable, visible, state }) => focusable && visible && state.disabled !== true)
      .map(({ id, parent, properties, state }) => ({
        id,
        kind:
          typeof properties.targetKind === "string"
            ? (properties.targetKind as FocusTarget["kind"])
            : "custom",
        ...(parent === undefined ? {} : { parentId: parent }),
        ...(state.locked === undefined ? {} : { locked: state.locked }),
        ...(state.disabled === undefined ? {} : { disabled: state.disabled })
      }));
    const current = this.focus.state.target;
    if (current !== undefined) this.#previous = current;
    return this.focus.setTargets(targets);
  }
  public restore(): FocusState {
    if (this.#previous === undefined) return this.focus.state;
    try {
      return this.focus.focus(this.#previous);
    } catch {
      return this.focus.state;
    }
  }
  public focusNode(id: string): FocusState {
    const key = this.focus.state.order.find((entry) => entry.endsWith(`:${id}`));
    if (key === undefined) return this.focus.state;
    const separator = key.indexOf(":");
    return this.focus.focus({
      kind: key.slice(0, separator) as FocusTarget["kind"],
      id: key.slice(separator + 1)
    });
  }
  public focusRing(highContrast: boolean, focused: boolean): FocusRingStyle {
    return Object.freeze({
      visible: focused,
      token: highContrast ? "CanvasText" : "--scada-focus-color",
      width: highContrast ? 3 : 2,
      offset: 2
    });
  }
}
