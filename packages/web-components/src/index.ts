import type {
  AccessibilityRendererAdapter,
  AccessibilityState
} from "@web-scada/interaction-engine";

export const SCADA_THEME_TOKENS = [
  "--scada-background",
  "--scada-surface",
  "--scada-grid-color",
  "--scada-selection-color",
  "--scada-port-color",
  "--scada-running-color",
  "--scada-warning-color",
  "--scada-alarm-color",
  "--scada-disabled-color"
] as const;

export type ScadaThemeToken = (typeof SCADA_THEME_TOKENS)[number];

export class WebComponentAccessibilityAdapter implements AccessibilityRendererAdapter {
  readonly #nodeHosts = new Map<string, HTMLElement>();
  public constructor(private readonly host: HTMLElement) {}
  public registerNodeHost(nodeId: string, element: HTMLElement): () => void {
    this.#nodeHosts.set(nodeId, element);
    return () => this.#nodeHosts.delete(nodeId);
  }
  public updateAccessibility(state: Readonly<AccessibilityState>): void {
    this.#applyPreferences(state);
    this.updateNodes(state, [...state.tree.nodes.keys()], []);
  }
  public updateNodes(
    state: Readonly<AccessibilityState>,
    changedIds: readonly string[],
    removedIds: readonly string[]
  ): void {
    for (const id of removedIds) this.#clearElement(this.#nodeHosts.get(id));
    for (const id of changedIds) {
      const element = this.#nodeHosts.get(id);
      const metadata = state.aria.get(id);
      if (element === undefined || metadata === undefined) continue;
      this.#clearElement(element);
      for (const [name, value] of Object.entries(metadata))
        if (value !== undefined) element.setAttribute(name, String(value));
      element.toggleAttribute("data-accessibility-focused", state.focus.target?.id === id);
    }
    this.#applyPreferences(state);
  }
  public clearAccessibility(): void {
    for (const element of this.#nodeHosts.values()) this.#clearElement(element);
    this.host.removeAttribute("data-high-contrast");
    this.host.removeAttribute("data-reduced-motion");
  }
  #applyPreferences(state: Readonly<AccessibilityState>): void {
    this.host.toggleAttribute("data-high-contrast", state.preferences.highContrast);
    this.host.toggleAttribute("data-reduced-motion", state.preferences.prefersReducedMotion);
  }
  #clearElement(element: HTMLElement | undefined): void {
    if (element === undefined) return;
    for (const attribute of Array.from(element.attributes))
      if (
        attribute.name === "role" ||
        attribute.name === "tabindex" ||
        attribute.name.startsWith("aria-") ||
        attribute.name === "data-accessibility-focused"
      )
        element.removeAttribute(attribute.name);
  }
}
