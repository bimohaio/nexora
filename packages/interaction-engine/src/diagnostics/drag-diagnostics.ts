import type { DragDiagnosticsSnapshot } from "../types/drag.js";

export class DragDiagnostics {
  #started = 0;
  #distance = 0;
  #updates = 0;
  #previews = 0;
  #commands = 0;
  #frameTime = 0;
  public constructor(
    public readonly enabled = false,
    private readonly now: () => number = () => Date.now()
  ) {}
  public start(): void {
    if (this.enabled) this.#started = this.now();
  }
  public recordUpdate(distance: number, frameTime: number): void {
    if (!this.enabled) return;
    this.#updates++;
    this.#distance = distance;
    this.#frameTime += Math.max(0, frameTime);
  }
  public recordPreview(): void {
    if (this.enabled) this.#previews++;
  }
  public recordCommand(): void {
    if (this.enabled) this.#commands++;
  }
  public snapshot(): DragDiagnosticsSnapshot {
    return Object.freeze({
      enabled: this.enabled,
      duration: this.#started === 0 ? 0 : Math.max(0, this.now() - this.#started),
      movementDistance: this.#distance,
      updateCount: this.#updates,
      previewUpdates: this.#previews,
      commandCount: this.#commands,
      totalFrameTime: this.#frameTime
    });
  }
}
