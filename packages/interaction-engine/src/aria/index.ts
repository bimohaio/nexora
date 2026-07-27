import type { AccessibilityNode, AriaMetadata } from "../types/accessibility.js";

export interface AriaGenerationOptions {
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly live?: "off" | "polite" | "assertive";
  readonly roleDescription?: string;
}

export function generateAriaMetadata(
  node: Readonly<AccessibilityNode>,
  options: AriaGenerationOptions = {}
): AriaMetadata {
  return Object.freeze({
    role: node.role,
    "aria-label": node.label,
    ...(options.labelledBy === undefined ? {} : { "aria-labelledby": options.labelledBy }),
    ...((options.describedBy ?? node.description) === undefined
      ? {}
      : { "aria-describedby": options.describedBy ?? node.description }),
    ...(!node.visible ? { "aria-hidden": true } : {}),
    ...(node.state.selected === undefined ? {} : { "aria-selected": node.state.selected }),
    ...(node.state.expanded === undefined ? {} : { "aria-expanded": node.state.expanded }),
    ...(node.state.current === undefined ? {} : { "aria-current": node.state.current }),
    ...(node.state.disabled === undefined ? {} : { "aria-disabled": node.state.disabled }),
    ...(node.state.pressed === undefined ? {} : { "aria-pressed": node.state.pressed }),
    ...(options.live === undefined ? {} : { "aria-live": options.live }),
    ...(node.state.busy === undefined ? {} : { "aria-busy": node.state.busy }),
    ...(options.roleDescription === undefined
      ? {}
      : { "aria-roledescription": options.roleDescription }),
    ...(node.focusable && node.visible && node.state.disabled !== true ? { tabindex: 0 } : {})
  });
}
