import { DEFAULT_KEY_BINDINGS } from "../bindings/index.js";
import type { InteractionModifiers } from "../events/index.js";
import type { KeyBinding, KeyboardCommand } from "../types/keyboard.js";
import { keyChord } from "../utils/keyboard-utils.js";

export type KeyboardPlatform = "mac" | "windows" | "linux";

export class KeyMap {
  readonly #bindings = new Map<string, KeyboardCommand>();
  public constructor(
    bindings: readonly KeyBinding[] = DEFAULT_KEY_BINDINGS,
    platform: KeyboardPlatform = "linux"
  ) {
    for (const binding of bindings) {
      if (
        binding.platform === undefined ||
        binding.platform === "all" ||
        binding.platform === platform
      )
        this.#bindings.set(binding.key, binding.command);
    }
  }
  public resolve(key: string, modifiers: InteractionModifiers): KeyboardCommand | undefined {
    return this.#bindings.get(keyChord(key, modifiers));
  }
  public withOverrides(bindings: readonly KeyBinding[], platform?: KeyboardPlatform): KeyMap {
    const existing = [...this.#bindings].map(([key, command]) => ({ key, command }));
    return new KeyMap([...existing, ...bindings], platform);
  }
}
