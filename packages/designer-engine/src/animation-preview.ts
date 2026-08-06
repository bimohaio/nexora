import type { ScadaDocument } from "@web-scada/core";
import type {
  AnimationFrameDriver,
  AnimationTimeSource,
  ReducedMotionState,
  VisibilityState
} from "@web-scada/animation-engine";
// Compatibility façade intentionally delegates to Runtime Engine; no runtime state enters Designer.
// eslint-disable-next-line no-restricted-imports
import {
  RuntimeAnimationManager,
  type SymbolAnimationDiagnostic,
  type SymbolAnimationSample
} from "@web-scada/runtime-engine";
import type { SymbolRegistry } from "@web-scada/symbols";

export interface DesignerAnimationPreviewOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly symbols: SymbolRegistry;
  readonly frameDriver: AnimationFrameDriver;
  readonly timeSource?: AnimationTimeSource;
  readonly onSamples?: (entityId: string, samples: readonly SymbolAnimationSample[]) => void;
  readonly onDiagnostic?: (diagnostic: SymbolAnimationDiagnostic) => void;
  readonly reducedMotion?: ReducedMotionState;
  readonly visibility?: VisibilityState;
}

/** Designer façade over the production RuntimeAnimationManager. It owns no alternate clock path. */
export class DesignerAnimationPreviewController {
  readonly #runtime: RuntimeAnimationManager;
  #document: Readonly<ScadaDocument>;
  #disposed = false;

  public constructor(options: DesignerAnimationPreviewOptions) {
    this.#document = options.document;
    this.#runtime = new RuntimeAnimationManager({
      symbols: options.symbols,
      frameDriver: options.frameDriver,
      ...(options.timeSource === undefined ? {} : { timeSource: options.timeSource }),
      ...(options.onSamples === undefined ? {} : { onSamples: options.onSamples }),
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
      ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
      ...(options.visibility === undefined ? {} : { visibility: options.visibility })
    });
    this.#runtime.loadDocument(this.#document);
  }

  public updateDocument(document: Readonly<ScadaDocument>): void {
    this.#assertUsable();
    this.#document = document;
    this.#runtime.loadDocument(document);
  }

  public play(entityId: string, slotId: string): void {
    this.#assertUsable();
    this.#runtime.play(entityId, slotId);
  }

  public pause(): void {
    this.#assertUsable();
    this.#runtime.pause();
  }

  public resume(): void {
    this.#assertUsable();
    this.#runtime.resume();
  }

  public restart(entityId: string, slotId: string): void {
    this.#assertUsable();
    this.#runtime.restart(entityId, slotId);
  }

  public stop(entityId?: string): void {
    this.#assertUsable();
    if (entityId === undefined) this.#runtime.stop();
    else this.#runtime.stopEntity(entityId);
  }

  public seek(entityId: string, slotId: string, progress: number): void {
    this.#assertUsable();
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new RangeError("Preview seek progress must be between zero and one.");
    this.#runtime.seek(entityId, slotId, progress);
  }

  public setSpeedOverride(rate: number, entityId?: string): void {
    this.#assertUsable();
    if (!Number.isFinite(rate) || rate < 0)
      throw new RangeError("Preview speed override must be finite and non-negative.");
    if (entityId === undefined) this.#runtime.scheduler.setPlaybackRate(rate);
    else this.#runtime.setEntityPlaybackRate(entityId, rate);
  }

  public setReducedMotion(value: ReducedMotionState): void {
    this.#runtime.setReducedMotion(value);
  }

  public setVisibility(value: VisibilityState): void {
    this.#runtime.setVisibility(value);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#runtime.dispose();
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Designer animation preview is disposed.");
  }
}
