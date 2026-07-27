import type {
  AccessibilityState,
  AccessibilityTreeState,
  Announcement,
  AccessibilityRole
} from "../types/accessibility.js";
import type { FocusState } from "../types/keyboard.js";

export type AccessibilityEvent =
  | { readonly type: "accessibility-updated"; readonly state: AccessibilityState }
  | { readonly type: "accessibility-focus-changed"; readonly focus: FocusState }
  | { readonly type: "announcement-queued"; readonly announcement: Announcement }
  | { readonly type: "announcement-delivered"; readonly announcement: Announcement }
  | { readonly type: "role-changed"; readonly nodeId: string; readonly role: AccessibilityRole }
  | { readonly type: "accessibility-tree-updated"; readonly tree: AccessibilityTreeState };
export type AccessibilityEventListener = (event: Readonly<AccessibilityEvent>) => void;
