import type { Announcement, ScreenReaderAdapter } from "../types/accessibility.js";

export class ScreenReaderCoordinator {
  #lastDelivered: Announcement | undefined;
  #disposed = false;
  public constructor(private readonly adapter: ScreenReaderAdapter) {}
  public get lastDelivered(): Announcement | undefined {
    return this.#lastDelivered;
  }
  public deliver(announcement: Announcement): void {
    if (this.#disposed) return;
    this.adapter.deliver(announcement);
    this.#lastDelivered = announcement;
  }
  public cancel(id: string): void {
    this.adapter.cancel?.(id);
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.adapter.clear();
    this.#lastDelivered = undefined;
    this.#disposed = true;
  }
}
