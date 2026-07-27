import type { KeyBinding } from "../types/keyboard.js";

export const DEFAULT_KEY_BINDINGS: readonly KeyBinding[] = Object.freeze([
  { key: "ArrowRight", command: "navigate-next" },
  { key: "ArrowDown", command: "navigate-next" },
  { key: "Tab", command: "navigate-next" },
  { key: "Shift+Tab", command: "navigate-previous" },
  { key: "ArrowLeft", command: "navigate-previous" },
  { key: "ArrowUp", command: "navigate-previous" },
  { key: "Home", command: "navigate-first" },
  { key: "End", command: "navigate-last" },
  { key: "PageUp", command: "navigate-page-up" },
  { key: "PageDown", command: "navigate-page-down" },
  { key: "Escape", command: "escape" },
  { key: "Enter", command: "activate" },
  { key: "Space", command: "toggle-selection" }
]);
