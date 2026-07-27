import type { CoordinateConverter, InteractionHitTester } from "../types/index.js";

export interface InteractionContextInit {
  readonly viewport?: unknown;
  readonly renderer?: unknown;
  readonly document?: unknown;
  readonly designerState?: unknown;
  readonly runtimeSnapshot?: unknown;
  readonly hitTester: InteractionHitTester;
  readonly coordinateConverter: CoordinateConverter;
  readonly theme?: unknown;
  readonly options?: Readonly<Record<string, unknown>>;
}

export class InteractionContext {
  public readonly viewport: unknown;
  public readonly renderer: unknown;
  public readonly document: unknown;
  public readonly designerState: unknown;
  public readonly runtimeSnapshot: unknown;
  public readonly hitTester: InteractionHitTester;
  public readonly coordinateConverter: CoordinateConverter;
  public readonly theme: unknown;
  public readonly options: Readonly<Record<string, unknown>>;
  public constructor(init: InteractionContextInit) {
    this.viewport = init.viewport;
    this.renderer = init.renderer;
    this.document = init.document;
    this.designerState = init.designerState;
    this.runtimeSnapshot = init.runtimeSnapshot;
    this.hitTester = init.hitTester;
    this.coordinateConverter = init.coordinateConverter;
    this.theme = init.theme;
    this.options = Object.freeze({ ...(init.options ?? {}) });
    Object.freeze(this);
  }
}
