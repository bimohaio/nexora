import type {
  AccessibilityRendererAdapter,
  AccessibilityState,
  Announcement,
  AriaMetadata,
  ScreenReaderAdapter
} from "@web-scada/interaction-engine";
import type { SvgRenderer } from "./contracts.js";

const ARIA_ATTRIBUTES = [
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-selected",
  "aria-expanded",
  "aria-current",
  "aria-disabled",
  "aria-pressed",
  "aria-live",
  "aria-busy",
  "aria-roledescription",
  "tabindex"
] as const;

function applyMetadata(element: Element, metadata: AriaMetadata | undefined): void {
  for (const name of ARIA_ATTRIBUTES) {
    const value = metadata?.[name];
    if (value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, String(value));
  }
}

export class SvgAccessibilityAdapter implements AccessibilityRendererAdapter {
  readonly #elements = new Map<string, Element>();
  public constructor(private readonly renderer: SvgRenderer) {}
  public updateAccessibility(state: Readonly<AccessibilityState>): void {
    this.#applyPreferences(state);
    this.updateNodes(state, [...state.tree.nodes.keys()], []);
  }
  public updateNodes(
    state: Readonly<AccessibilityState>,
    changedIds: readonly string[],
    removedIds: readonly string[]
  ): void {
    for (const id of removedIds) {
      const element = this.#elements.get(id);
      if (element !== undefined) applyMetadata(element, undefined);
      this.#elements.delete(id);
    }
    for (const id of changedIds) {
      const node = state.tree.nodes.get(id);
      const element =
        this.renderer.getElementForNode(id) ??
        this.renderer.getElementForConnection(id) ??
        (node?.parent === undefined ? this.renderer.getSvgElement() : undefined);
      if (element === undefined) continue;
      applyMetadata(element, state.aria.get(id));
      element.toggleAttribute("data-accessibility-focused", state.focus.target?.id === id);
      this.#elements.set(id, element);
    }
    this.#applyPreferences(state);
  }
  public clearAccessibility(): void {
    for (const element of this.#elements.values()) applyMetadata(element, undefined);
    this.#elements.clear();
    const root = this.renderer.getSvgElement();
    root?.removeAttribute("data-high-contrast");
    root?.removeAttribute("data-reduced-motion");
  }
  #applyPreferences(state: Readonly<AccessibilityState>): void {
    const root = this.renderer.getSvgElement();
    if (root === undefined) return;
    root.toggleAttribute("data-high-contrast", state.preferences.highContrast);
    root.toggleAttribute("data-reduced-motion", state.preferences.prefersReducedMotion);
    root.style.setProperty("--scada-accessibility-focus", state.visualTokens.focusToken);
    root.style.setProperty("--scada-accessibility-selection", state.visualTokens.selectionToken);
  }
}

export class SvgLiveRegionAdapter implements ScreenReaderAdapter {
  readonly #polite: HTMLDivElement;
  readonly #assertive: HTMLDivElement;
  public constructor(container: HTMLElement) {
    this.#polite = this.#create("polite");
    this.#assertive = this.#create("assertive");
    container.append(this.#polite, this.#assertive);
  }
  public deliver(announcement: Readonly<Announcement>): void {
    const region = announcement.politeness === "assertive" ? this.#assertive : this.#polite;
    region.textContent = announcement.message;
    region.dataset.announcementId = announcement.id;
  }
  public cancel(announcementId: string): void {
    for (const region of [this.#polite, this.#assertive])
      if (region.dataset.announcementId === announcementId) region.textContent = "";
  }
  public clear(): void {
    this.#polite.remove();
    this.#assertive.remove();
  }
  #create(live: "polite" | "assertive"): HTMLDivElement {
    const region = document.createElement("div");
    region.setAttribute("aria-live", live);
    region.setAttribute("aria-atomic", "true");
    region.dataset.scadaLiveRegion = live;
    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap"
    });
    return region;
  }
}
