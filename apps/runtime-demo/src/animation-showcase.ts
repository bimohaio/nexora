import {
  BrowserAnimationFrameDriver,
  type AnimationFrameDriver,
  type AnimationTimeSource,
  type ReducedMotionState
} from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";
import { SvgSymbolAnimationAdapter, type SvgRenderer } from "@web-scada/renderer-svg";
import { RuntimeAnimationManager, type SymbolAnimationDiagnostic } from "@web-scada/runtime-engine";
import type { SymbolRegistry } from "@web-scada/symbols";

export interface RuntimeAnimationShowcaseOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly symbols: SymbolRegistry;
  readonly renderer: Pick<SvgRenderer, "getElementForNode">;
  readonly entityIds?: ReadonlySet<string>;
  readonly frameDriver?: AnimationFrameDriver;
  readonly timeSource?: AnimationTimeSource;
  readonly onDiagnostic?: (diagnostic: SymbolAnimationDiagnostic) => void;
}

export interface RuntimeAnimationShowcaseSnapshot {
  readonly state: "playing" | "paused" | "stopped" | "disposed";
  readonly animatedSymbolCount: number;
  readonly activeSlotCount: number;
  readonly speed: number;
  readonly reducedMotion: ReducedMotionState;
}

/** Demo integration over the production runtime and SVG animation path. */
export class RuntimeAnimationShowcase {
  readonly #adapter: SvgSymbolAnimationAdapter;
  readonly #manager: RuntimeAnimationManager;
  readonly #slots: readonly { readonly entityId: string; readonly slotId: string }[];
  #state: RuntimeAnimationShowcaseSnapshot["state"] = "stopped";
  #speed = 1;
  #reducedMotion: ReducedMotionState = "no-preference";

  public constructor(options: RuntimeAnimationShowcaseOptions) {
    this.#adapter = new SvgSymbolAnimationAdapter(options.renderer);
    this.#manager = new RuntimeAnimationManager({
      symbols: options.symbols,
      frameDriver: options.frameDriver ?? new BrowserAnimationFrameDriver(),
      ...(options.timeSource === undefined ? {} : { timeSource: options.timeSource }),
      onSamples: (entityId, samples) => {
        this.#adapter.applySamples(entityId, samples);
      },
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic })
    });
    this.#manager.loadDocument(options.document);
    this.#slots = Object.freeze(
      options.document.nodes.flatMap((node) => {
        if (options.entityIds !== undefined && !options.entityIds.has(node.id)) return [];
        const controller = this.#manager.controller(node.id);
        return controller?.slotIds.map((slotId) => ({ entityId: node.id, slotId })) ?? [];
      })
    );
  }

  public play(): void {
    this.#assertUsable();
    for (const { entityId, slotId } of this.#slots) this.#manager.play(entityId, slotId);
    this.#manager.scheduler.setPlaybackRate(this.#speed);
    this.#state = "playing";
  }

  public pause(): void {
    this.#assertUsable();
    this.#manager.pause();
    this.#state = "paused";
  }

  public resume(): void {
    this.#assertUsable();
    this.#manager.resume();
    this.#state = "playing";
  }

  public restart(): void {
    this.#assertUsable();
    this.#manager.stop();
    this.play();
  }

  public stop(): void {
    this.#assertUsable();
    this.#manager.stop();
    for (const entityId of new Set(this.#slots.map(({ entityId }) => entityId)))
      this.#adapter.applySamples(entityId, []);
    this.#state = "stopped";
  }

  public setSpeed(speed: number): void {
    this.#assertUsable();
    if (!Number.isFinite(speed) || speed < 0)
      throw new RangeError("Animation speed must be finite and non-negative.");
    this.#speed = speed;
    this.#manager.scheduler.setPlaybackRate(speed);
  }

  public setReducedMotion(value: ReducedMotionState): void {
    this.#assertUsable();
    this.#reducedMotion = value;
    this.#manager.setReducedMotion(value);
  }

  public setDocumentVisibility(hidden: boolean): void {
    this.#assertUsable();
    this.#manager.setVisibility(hidden ? "document-hidden" : "visible");
  }

  public getSnapshot(): RuntimeAnimationShowcaseSnapshot {
    return Object.freeze({
      state: this.#state,
      animatedSymbolCount: new Set(this.#slots.map(({ entityId }) => entityId)).size,
      activeSlotCount: this.#manager.scheduler.getSnapshot().activeTaskIds.length,
      speed: this.#speed,
      reducedMotion: this.#reducedMotion
    });
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    this.#manager.dispose();
    this.#adapter.dispose();
    this.#state = "disposed";
  }

  #assertUsable(): void {
    if (this.#state === "disposed") throw new Error("Runtime animation showcase is disposed.");
  }
}
