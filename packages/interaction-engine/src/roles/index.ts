import { AriaError } from "../errors/index.js";
import type { AccessibilityRole } from "../types/accessibility.js";

export const STANDARD_ACCESSIBILITY_ROLES: readonly AccessibilityRole[] = Object.freeze([
  "application",
  "document",
  "group",
  "toolbar",
  "button",
  "menu",
  "menuitem",
  "dialog",
  "grid",
  "row",
  "cell",
  "tree",
  "treeitem",
  "list",
  "listitem",
  "region",
  "status",
  "alert",
  "img",
  "graphics-document",
  "graphics-object",
  "graphics-symbol"
]);

export class AccessibilityRoleRegistry {
  readonly #roles = new Set<AccessibilityRole>(STANDARD_ACCESSIBILITY_ROLES);
  public register(role: AccessibilityRole): void {
    const value = role.trim();
    if (value === "") throw new AriaError("ARIA_ROLE_INVALID", "Role must not be empty.");
    this.#roles.add(value);
  }
  public has(role: AccessibilityRole): boolean {
    return this.#roles.has(role);
  }
  public require(role: AccessibilityRole): AccessibilityRole {
    if (!this.has(role)) throw new AriaError("ARIA_ROLE_INVALID", `Unknown role: ${role}`);
    return role;
  }
}
