import type { FocusState } from "./keyboard.js";

export type AccessibilityRole =
  | "application"
  | "document"
  | "group"
  | "toolbar"
  | "button"
  | "menu"
  | "menuitem"
  | "dialog"
  | "grid"
  | "row"
  | "cell"
  | "tree"
  | "treeitem"
  | "list"
  | "listitem"
  | "region"
  | "status"
  | "alert"
  | "img"
  | "graphics-document"
  | "graphics-object"
  | "graphics-symbol"
  | (string & {});

export interface AccessibilityNodeState {
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly current?: boolean | "page" | "step" | "location" | "date" | "time";
  readonly disabled?: boolean;
  readonly pressed?: boolean | "mixed";
  readonly busy?: boolean;
  readonly locked?: boolean;
  readonly readOnly?: boolean;
  readonly decorative?: boolean;
}

export interface AccessibilityNode {
  readonly id: string;
  readonly parent?: string;
  readonly children: readonly string[];
  readonly role: AccessibilityRole;
  readonly label: string;
  readonly description?: string;
  readonly state: AccessibilityNodeState;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly visible: boolean;
  readonly focusable: boolean;
}

export interface AccessibilityTreeState {
  readonly roots: readonly string[];
  readonly nodes: ReadonlyMap<string, AccessibilityNode>;
  readonly revision: number;
}

export interface AriaMetadata {
  readonly role: AccessibilityRole;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-hidden"?: boolean;
  readonly "aria-selected"?: boolean;
  readonly "aria-expanded"?: boolean;
  readonly "aria-current"?: boolean | string;
  readonly "aria-disabled"?: boolean;
  readonly "aria-pressed"?: boolean | "mixed";
  readonly "aria-live"?: LiveRegionPoliteness;
  readonly "aria-busy"?: boolean;
  readonly "aria-roledescription"?: string;
  readonly tabindex?: number;
}

export interface AccessibleNameSources {
  readonly explicitLabel?: string;
  readonly symbolMetadata?: Readonly<Record<string, unknown>>;
  readonly propertyMetadata?: Readonly<Record<string, unknown>>;
  readonly pluginMetadata?: Readonly<Record<string, unknown>>;
  readonly fallbackName?: string;
  readonly id?: string;
}

export type LiveRegionPoliteness = "off" | "polite" | "assertive";
export type AnnouncementKind = "selection" | "focus" | "status" | "error" | "warning" | "live";

export interface Announcement {
  readonly id: string;
  readonly message: string;
  readonly kind: AnnouncementKind;
  readonly politeness: LiveRegionPoliteness;
  readonly priority: number;
  readonly timestamp: number;
}

export interface AnnouncementInput {
  readonly id?: string;
  readonly message: string;
  readonly kind?: AnnouncementKind;
  readonly politeness?: LiveRegionPoliteness;
  readonly priority?: number;
  readonly timestamp: number;
}

export interface AccessibilityPreferences {
  readonly highContrast: boolean;
  readonly prefersReducedMotion: boolean;
}

export interface AccessibilityVisualTokens {
  readonly highContrast: boolean;
  readonly focusOutlineVisible: boolean;
  readonly selectionOutlineVisible: boolean;
  readonly focusToken: string;
  readonly selectionToken: string;
  readonly backgroundToken: string;
}

export interface AccessibilityState {
  readonly tree: AccessibilityTreeState;
  readonly focus: FocusState;
  readonly aria: ReadonlyMap<string, AriaMetadata>;
  readonly preferences: AccessibilityPreferences;
  readonly visualTokens: AccessibilityVisualTokens;
  readonly revision: number;
}

export interface AccessibilityPolicyContext {
  readonly readOnly: boolean;
}

export interface AccessibilityPolicy {
  readonly id: string;
  includes(
    node: Readonly<AccessibilityNode>,
    context: Readonly<AccessibilityPolicyContext>
  ): boolean;
}

export interface AccessibilityRendererAdapter {
  updateAccessibility(state: Readonly<AccessibilityState>): void;
  updateNodes(
    state: Readonly<AccessibilityState>,
    changedIds: readonly string[],
    removedIds: readonly string[]
  ): void;
  clearAccessibility(): void;
}

export interface ScreenReaderAdapter {
  deliver(announcement: Readonly<Announcement>): void;
  cancel?(announcementId: string): void;
  clear(): void;
}
