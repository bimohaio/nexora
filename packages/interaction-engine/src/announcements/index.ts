import { AnnouncementError } from "../errors/index.js";
import type { Announcement, AnnouncementInput } from "../types/accessibility.js";

export interface AnnouncementQueueOptions {
  readonly deduplicate?: boolean;
  readonly maximumSize?: number;
}

export class AnnouncementQueue {
  readonly #queue: Announcement[] = [];
  readonly #deduplicate: boolean;
  readonly #maximumSize: number;
  #sequence = 0;
  #disposed = false;
  public constructor(options: AnnouncementQueueOptions = {}) {
    this.#deduplicate = options.deduplicate ?? true;
    this.#maximumSize = options.maximumSize ?? 100;
  }
  public get size(): number {
    return this.#queue.length;
  }
  public enqueue(input: AnnouncementInput): Announcement | undefined {
    this.#assertUsable();
    const message = input.message.trim();
    if (message === "" || !Number.isFinite(input.timestamp))
      throw new AnnouncementError(
        "ANNOUNCEMENT_INVALID",
        "Announcement message and timestamp must be valid."
      );
    if (
      this.#deduplicate &&
      this.#queue.some(
        (item) => item.message === message && item.politeness === (input.politeness ?? "polite")
      )
    )
      return undefined;
    const announcement: Announcement = Object.freeze({
      id: input.id ?? `announcement-${String(++this.#sequence)}`,
      message,
      kind: input.kind ?? "status",
      politeness: input.politeness ?? (input.kind === "error" ? "assertive" : "polite"),
      priority:
        input.priority ?? (input.kind === "error" ? 100 : input.kind === "warning" ? 50 : 0),
      timestamp: input.timestamp
    });
    this.#queue.push(announcement);
    this.#queue.sort((left, right) => {
      const priority = right.priority - left.priority;
      if (priority !== 0) return priority;
      if (left.politeness !== right.politeness) return left.politeness === "assertive" ? -1 : 1;
      return left.timestamp - right.timestamp || left.id.localeCompare(right.id);
    });
    if (this.#queue.length > this.#maximumSize) this.#queue.pop();
    return announcement;
  }
  public next(): Announcement | undefined {
    this.#assertUsable();
    return this.#queue.shift();
  }
  public cancel(id: string): boolean {
    this.#assertUsable();
    const index = this.#queue.findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.#queue.splice(index, 1);
    return true;
  }
  public clear(): void {
    this.#queue.length = 0;
  }
  public dispose(): void {
    this.clear();
    this.#disposed = true;
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new AnnouncementError("ANNOUNCEMENT_DISPOSED", "Announcement queue is disposed.");
  }
}
