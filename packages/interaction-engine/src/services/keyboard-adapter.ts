import type { KeyboardEngine } from "../keyboard/index.js";
import type { KeyboardInput, KeyboardInputType, KeyboardState } from "../types/keyboard.js";

export interface KeyboardEventLike {
  readonly key: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly timeStamp: number;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly getModifierState?: (key: string) => boolean;
}

export class KeyboardAdapter {
  public constructor(private readonly engine: KeyboardEngine) {}
  public process(type: "key-down" | "key-up", event: Readonly<KeyboardEventLike>): KeyboardState {
    return this.engine.process({
      type,
      key: event.key,
      ...(event.code === undefined ? {} : { code: event.code }),
      repeat: event.repeat ?? false,
      timestamp: event.timeStamp,
      modifiers: {
        shift: event.shiftKey ?? false,
        control: event.ctrlKey ?? false,
        alt: event.altKey ?? false,
        meta: event.metaKey ?? false,
        capsLock: event.getModifierState?.("CapsLock") ?? false,
        numLock: event.getModifierState?.("NumLock") ?? false,
        scrollLock: event.getModifierState?.("ScrollLock") ?? false
      }
    });
  }
  public composition(
    type: Extract<KeyboardInputType, "composition-start" | "composition-end">,
    timestamp: number
  ): KeyboardState {
    return this.engine.process({ type, timestamp });
  }
  public processInput(input: KeyboardInput): KeyboardState {
    return this.engine.process(input);
  }
}
