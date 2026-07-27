import type {
  Announcement,
  AnnouncementInput,
  ScreenReaderAdapter
} from "../types/accessibility.js";
import { AnnouncementQueue, type AnnouncementQueueOptions } from "../announcements/index.js";

export class LiveRegion {
  readonly #queue: AnnouncementQueue;
  #disposed = false;
  public constructor(
    private readonly adapter: ScreenReaderAdapter,
    options: AnnouncementQueueOptions = {}
  ) {
    this.#queue = new AnnouncementQueue(options);
  }
  public get queued(): number {
    return this.#queue.size;
  }
  public announce(input: AnnouncementInput): Announcement | undefined {
    return this.#queue.enqueue(input);
  }
  public flush(limit = Number.POSITIVE_INFINITY): readonly Announcement[] {
    const delivered: Announcement[] = [];
    while (delivered.length < limit) {
      const announcement = this.#queue.next();
      if (announcement === undefined) break;
      this.adapter.deliver(announcement);
      delivered.push(announcement);
    }
    return Object.freeze(delivered);
  }
  public cancel(id: string): boolean {
    const canceled = this.#queue.cancel(id);
    if (canceled) this.adapter.cancel?.(id);
    return canceled;
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#queue.dispose();
    this.adapter.clear();
    this.#disposed = true;
  }
}
