import type {
  AccessibilityPreferences,
  AccessibilityState,
  AccessibilityTreeState,
  AccessibilityVisualTokens,
  AriaMetadata
} from "../types/accessibility.js";
import type { FocusState } from "../types/keyboard.js";

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = Object.freeze({
  highContrast: false,
  prefersReducedMotion: false
});
export function accessibilityVisualTokens(
  preferences: AccessibilityPreferences
): AccessibilityVisualTokens {
  return Object.freeze({
    highContrast: preferences.highContrast,
    focusOutlineVisible: true,
    selectionOutlineVisible: true,
    focusToken: preferences.highContrast ? "CanvasText" : "--scada-focus-color",
    selectionToken: preferences.highContrast ? "Highlight" : "--scada-selection-color",
    backgroundToken: preferences.highContrast ? "Canvas" : "--scada-background"
  });
}
export function createAccessibilityState(input: {
  readonly tree: AccessibilityTreeState;
  readonly focus: FocusState;
  readonly aria?: ReadonlyMap<string, AriaMetadata>;
  readonly preferences?: AccessibilityPreferences;
  readonly revision?: number;
}): AccessibilityState {
  const preferences = Object.freeze({
    ...(input.preferences ?? DEFAULT_ACCESSIBILITY_PREFERENCES)
  });
  return Object.freeze({
    tree: input.tree,
    focus: input.focus,
    aria: input.aria ?? new Map(),
    preferences,
    visualTokens: accessibilityVisualTokens(preferences),
    revision: input.revision ?? 0
  });
}
