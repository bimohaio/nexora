import type { InteractionModifiers, InteractionPointer } from "../events/index.js";
import { NO_MODIFIERS } from "../events/index.js";
import type { CoordinatePoint, InteractionTarget } from "../types/index.js";

export interface InteractionState {
  readonly currentPointer?: InteractionPointer;
  readonly pressedButtons: ReadonlySet<number>;
  readonly modifiers: InteractionModifiers;
  readonly activeSessionId?: string;
  readonly hoverTarget?: InteractionTarget;
  readonly focusedTarget?: InteractionTarget;
  readonly pointerPosition?: CoordinatePoint;
}

export function createInteractionState(state: Partial<InteractionState> = {}): InteractionState {
  return Object.freeze({
    pressedButtons: new Set(state.pressedButtons ?? []),
    modifiers: state.modifiers ?? NO_MODIFIERS,
    ...(state.currentPointer === undefined ? {} : { currentPointer: state.currentPointer }),
    ...(state.activeSessionId === undefined ? {} : { activeSessionId: state.activeSessionId }),
    ...(state.hoverTarget === undefined ? {} : { hoverTarget: state.hoverTarget }),
    ...(state.focusedTarget === undefined ? {} : { focusedTarget: state.focusedTarget }),
    ...(state.pointerPosition === undefined ? {} : { pointerPosition: state.pointerPosition })
  });
}

export class InteractionStateStore {
  #state: InteractionState;
  readonly #listeners = new Set<(state: InteractionState) => void>();
  public constructor(initial: InteractionState = createInteractionState()) {
    this.#state = initial;
  }
  public get value(): InteractionState {
    return this.#state;
  }
  public replace(state: InteractionState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener(state);
  }
  public update(update: Partial<InteractionState>): void {
    this.replace(createInteractionState({ ...this.#state, ...update }));
  }
  public subscribe(listener: (state: InteractionState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public dispose(): void {
    this.#listeners.clear();
  }
}
export * from "./keyboard-state.js";
export * from "./accessibility-state.js";
