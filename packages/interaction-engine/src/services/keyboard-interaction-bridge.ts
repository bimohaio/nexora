import type { InteractionManager } from "../core/index.js";
import type { KeyboardDispatcher } from "../dispatcher/keyboard-dispatcher.js";
import { InteractionEvent, type KeyboardEvent } from "../events/index.js";
import type { InteractionTarget } from "../types/index.js";

export interface KeyboardInteractionBridgeOptions {
  readonly fallbackTarget?: InteractionTarget;
  readonly now?: () => number;
}

export class KeyboardInteractionBridge {
  readonly #unsubscribe: () => void;
  public constructor(
    dispatcher: KeyboardDispatcher,
    manager: InteractionManager,
    options: KeyboardInteractionBridgeOptions = {}
  ) {
    const fallback = options.fallbackTarget ?? { id: "canvas", kind: "canvas" };
    const now = options.now ?? (() => Date.now());
    this.#unsubscribe = dispatcher.subscribe((event) => {
      const target =
        "state" in event && event.state.focusTarget !== undefined
          ? event.state.focusTarget
          : "focus" in event && event.focus.target !== undefined
            ? event.focus.target
            : fallback;
      manager.dispatch(
        new InteractionEvent<KeyboardEvent>({
          type:
            event.type === "key-pressed"
              ? "key-down"
              : event.type === "key-released"
                ? "key-up"
                : event.type,
          timestamp:
            "key" in event ? event.key.timestamp : "state" in event ? event.state.timestamp : now(),
          target,
          data: event
        })
      );
    });
  }
  public dispose(): void {
    this.#unsubscribe();
  }
}
