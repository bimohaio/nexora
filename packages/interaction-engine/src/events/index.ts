import type { CoordinatePoint, InteractionTarget } from "../types/index.js";

export type InteractionEventType =
  | "pointer-down"
  | "pointer-move"
  | "pointer-up"
  | "pointer-enter"
  | "pointer-leave"
  | "pointer-cancel"
  | "wheel"
  | "click"
  | "double-click"
  | "context-menu"
  | "key-down"
  | "key-up"
  | "focus"
  | "blur"
  | "resize"
  | (string & {});
export type PropagationPhase = "capture" | "target" | "bubble";
export type PointerType = "mouse" | "pen" | "touch" | "unknown";

export interface InteractionModifiers {
  readonly shift: boolean;
  readonly control: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
  readonly scrollLock: boolean;
}

export const NO_MODIFIERS: InteractionModifiers = Object.freeze({
  shift: false,
  control: false,
  alt: false,
  meta: false,
  capsLock: false,
  numLock: false,
  scrollLock: false
});

export function hasPrimaryModifier(
  modifiers: Readonly<InteractionModifiers>,
  platform: "mac" | "other"
): boolean {
  return platform === "mac" ? modifiers.meta : modifiers.control;
}

export interface InteractionPointer {
  readonly id: number;
  readonly buttons: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly type: PointerType;
  readonly primary: boolean;
  readonly position: CoordinatePoint;
  readonly modifiers: InteractionModifiers;
}

export interface InteractionEventInit<TData = unknown> {
  readonly type: InteractionEventType;
  readonly timestamp: number;
  readonly target: InteractionTarget;
  readonly pointer?: InteractionPointer;
  readonly modifiers?: InteractionModifiers;
  readonly data?: TData;
  readonly cancelable?: boolean;
  readonly bubbles?: boolean;
}

export class InteractionEvent<TData = unknown> {
  public readonly type: InteractionEventType;
  public readonly timestamp: number;
  public readonly target: InteractionTarget;
  public readonly pointer: InteractionPointer | undefined;
  public readonly modifiers: InteractionModifiers;
  public readonly data: TData | undefined;
  public readonly cancelable: boolean;
  public readonly bubbles: boolean;
  #phase: PropagationPhase = "target";
  #currentTarget: InteractionTarget;
  #propagationStopped = false;
  #immediatePropagationStopped = false;
  #defaultPrevented = false;

  public constructor(init: InteractionEventInit<TData>) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.target = init.target;
    this.#currentTarget = init.target;
    this.pointer = init.pointer;
    this.modifiers = init.modifiers ?? init.pointer?.modifiers ?? NO_MODIFIERS;
    this.data = init.data;
    this.cancelable = init.cancelable ?? true;
    this.bubbles = init.bubbles ?? true;
  }
  public get phase(): PropagationPhase {
    return this.#phase;
  }
  public get currentTarget(): InteractionTarget {
    return this.#currentTarget;
  }
  public get propagationStopped(): boolean {
    return this.#propagationStopped;
  }
  public get immediatePropagationStopped(): boolean {
    return this.#immediatePropagationStopped;
  }
  public get defaultPrevented(): boolean {
    return this.#defaultPrevented;
  }
  public stopPropagation(): void {
    this.#propagationStopped = true;
  }
  public stopImmediatePropagation(): void {
    this.#immediatePropagationStopped = true;
    this.#propagationStopped = true;
  }
  public preventDefault(): void {
    if (this.cancelable) this.#defaultPrevented = true;
  }
  /** @internal */
  public setDispatchPosition(phase: PropagationPhase, target: InteractionTarget): void {
    this.#phase = phase;
    this.#currentTarget = target;
    this.#immediatePropagationStopped = false;
  }
}
export * from "./drag-events.js";
export * from "./keyboard-events.js";
export * from "./accessibility-events.js";
