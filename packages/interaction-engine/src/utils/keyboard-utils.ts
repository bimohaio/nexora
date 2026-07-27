import { NO_MODIFIERS, type InteractionModifiers } from "../events/index.js";

const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  Esc: "Escape",
  Spacebar: "Space",
  " ": "Space",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown"
});

export function normalizeKeyName(key: string): string {
  const normalized = KEY_ALIASES[key] ?? key;
  return normalized.length === 1 ? normalized.toLowerCase() : normalized;
}

export function completeModifiers(
  modifiers: Partial<InteractionModifiers> = {}
): InteractionModifiers {
  return Object.freeze({ ...NO_MODIFIERS, ...modifiers });
}

export function keyChord(key: string, modifiers: InteractionModifiers): string {
  const parts = [
    modifiers.control ? "Control" : "",
    modifiers.meta ? "Meta" : "",
    modifiers.alt ? "Alt" : "",
    modifiers.shift ? "Shift" : "",
    normalizeKeyName(key)
  ].filter(Boolean);
  return parts.join("+");
}
