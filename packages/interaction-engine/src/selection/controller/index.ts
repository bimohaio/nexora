import type { InteractionDispatcher } from "../../dispatcher/index.js";
import type { InteractionEvent } from "../../events/index.js";
import type {
  CoordinatePoint,
  InteractionHitTester,
  InteractionTarget
} from "../../types/index.js";
import { SelectionManager } from "../manager/index.js";
import { DefaultSelectionModeStrategy, type SelectionModeStrategy } from "../strategies/index.js";
import type { SelectionSource } from "../types/index.js";
import type { HitResult } from "../../results/index.js";

export interface SelectionControllerOptions {
  readonly manager?: SelectionManager;
  readonly hitTester: InteractionHitTester;
  readonly modeStrategy?: SelectionModeStrategy;
  readonly interactionEventType?: string;
}

export class SelectionController {
  public readonly manager: SelectionManager;
  readonly #hitTester: InteractionHitTester;
  readonly #modeStrategy: SelectionModeStrategy;
  readonly #eventType: string;
  #detach: (() => void) | undefined;
  public constructor(options: SelectionControllerOptions) {
    this.manager = options.manager ?? new SelectionManager();
    this.#hitTester = options.hitTester;
    this.#modeStrategy = options.modeStrategy ?? new DefaultSelectionModeStrategy();
    this.#eventType = options.interactionEventType ?? "pointer-down";
  }
  public attach(dispatcher: InteractionDispatcher): void {
    if (this.#detach !== undefined) throw new Error("Selection controller is already attached.");
    this.#detach = dispatcher.addListener(
      (event) => {
        this.handleInteraction(event);
      },
      { type: this.#eventType, phase: "target" }
    );
  }
  public handleInteraction(event: InteractionEvent): void {
    const target =
      event.target.kind === "canvas" && event.pointer !== undefined
        ? this.#hitTester.pick({ position: event.pointer.position })
        : event.target;
    const mode = this.#modeStrategy.modeFor(event.modifiers);
    if (target === undefined || target.kind === "canvas") this.manager.clear("pointer");
    else this.manager.select(target, mode, "pointer");
  }
  public selectAt(position: CoordinatePoint, source: SelectionSource = "hit-test"): boolean {
    const target = this.#hitTester.pick({ position });
    return target === undefined
      ? this.manager.clear(source)
      : this.manager.select(target, "replace", source);
  }
  public selectManyAt(position: CoordinatePoint, source: SelectionSource = "hit-test"): boolean {
    return this.manager.selectMany(this.#hitTester.pickMany({ position }), "replace", source);
  }
  public selectTarget(target: InteractionTarget, source: SelectionSource = "api"): boolean {
    return this.manager.select(target, "replace", source);
  }
  public selectHitResult(
    result: Readonly<HitResult>,
    source: SelectionSource = "hit-test"
  ): boolean {
    return this.manager.select(
      Object.freeze({
        id: result.targetId,
        kind: result.targetType,
        ...(result.metadata === undefined ? {} : { metadata: result.metadata })
      }),
      "replace",
      source
    );
  }
  public dispose(): void {
    this.#detach?.();
    this.#detach = undefined;
    this.manager.dispose();
  }
}
