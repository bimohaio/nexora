import type { Point } from "@web-scada/geometry";
import type { InteractionEventType, InteractionModifiers, PointerType } from "../events/index.js";
import { NO_MODIFIERS } from "../events/index.js";
import { PointerError } from "../errors/index.js";
import type { CoordinateConversionService } from "../coordinates/index.js";

export interface PointerCoordinates {
  readonly screen: Point;
  readonly viewport: Point;
  readonly canvas: Point;
  readonly world: Point;
  readonly local?: Point;
}
export interface PointerState {
  readonly id: number;
  readonly type: PointerType;
  readonly position: Point;
  readonly movement: Point;
  readonly buttons: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly modifiers: InteractionModifiers;
  readonly timestamp: number;
  readonly primary: boolean;
  readonly coordinates: PointerCoordinates;
}
export interface PointerInput {
  readonly type: InteractionEventType;
  readonly pointerId?: number;
  readonly pointerType?: PointerType;
  readonly screen: Point;
  readonly buttons?: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
  readonly primary?: boolean;
  readonly modifiers?: InteractionModifiers;
  readonly timestamp: number;
  readonly localSymbolId?: string;
}
export interface NormalizedPointerEvent {
  readonly type: InteractionEventType;
  readonly state: PointerState;
}
export interface PointerCapture {
  capture(pointerId: number): void;
  release(pointerId: number): void;
}

export class PointerEngine {
  readonly #states = new Map<number, PointerState>();
  #disposed = false;
  public constructor(
    private readonly coordinates: CoordinateConversionService,
    private readonly capture?: PointerCapture
  ) {}
  public process(input: PointerInput): NormalizedPointerEvent {
    if (this.#disposed) throw new PointerError("POINTER_DISPOSED", "Pointer engine is disposed.");
    if (!Number.isFinite(input.timestamp))
      throw new PointerError("POINTER_EVENT_INVALID", "Pointer timestamp must be finite.");
    const id = input.pointerId ?? 0;
    const previous = this.#states.get(id);
    const viewport = this.coordinates.screenToViewport(input.screen);
    const canvas = this.coordinates.viewportToCanvas(viewport);
    const world = this.coordinates.canvasToWorld(canvas);
    const coordinates: PointerCoordinates = Object.freeze({
      screen: Object.freeze({ ...input.screen }),
      viewport: Object.freeze(viewport),
      canvas: Object.freeze(canvas),
      world: Object.freeze(world),
      ...(input.localSymbolId === undefined
        ? {}
        : { local: Object.freeze(this.coordinates.worldToLocal(world, input.localSymbolId)) })
    });
    const state: PointerState = Object.freeze({
      id,
      type: input.pointerType ?? "unknown",
      position: coordinates.world,
      movement: Object.freeze({
        x: previous === undefined ? 0 : world.x - previous.coordinates.world.x,
        y: previous === undefined ? 0 : world.y - previous.coordinates.world.y
      }),
      buttons: input.buttons ?? 0,
      pressure: input.pressure ?? 0,
      tiltX: input.tiltX ?? 0,
      tiltY: input.tiltY ?? 0,
      twist: input.twist ?? 0,
      modifiers: Object.freeze({ ...(input.modifiers ?? NO_MODIFIERS) }),
      timestamp: input.timestamp,
      primary: input.primary ?? true,
      coordinates
    });
    if (input.type === "pointer-up" || input.type === "pointer-cancel") {
      this.#states.delete(id);
      this.capture?.release(id);
    } else {
      this.#states.set(id, state);
      if (input.type === "pointer-down") this.capture?.capture(id);
    }
    return Object.freeze({ type: input.type, state });
  }
  public get(pointerId: number): PointerState | undefined {
    return this.#states.get(pointerId);
  }
  public get activePointers(): readonly PointerState[] {
    return Object.freeze([...this.#states.values()]);
  }
  public dispose(): void {
    for (const id of this.#states.keys()) this.capture?.release(id);
    this.#states.clear();
    this.#disposed = true;
  }
}
