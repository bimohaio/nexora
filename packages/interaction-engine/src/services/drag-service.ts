import type { DragEngine, StartDragInput } from "../drag/index.js";
import type { DragEventListener } from "../events/drag-events.js";
import type { PointerState } from "../pointer/index.js";
import type { DragCommitResult } from "../types/drag.js";

export class DragInteractionService {
  readonly #listeners = new Set<DragEventListener>();
  public constructor(private readonly engine: DragEngine) {}
  public subscribe(listener: DragEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public start(input: StartDragInput): void {
    this.#emit({ type: "drag-started", state: this.engine.start(input) });
  }
  public update(pointer: PointerState): void {
    this.#emit({ type: "drag-updated", state: this.engine.update(pointer) });
  }
  public commit(): DragCommitResult {
    const result = this.engine.commit();
    this.#emit({ type: "drag-committed", result });
    return result;
  }
  public cancel(reason?: string): void {
    this.engine.cancel(reason);
    this.#emit({ type: "drag-canceled", ...(reason === undefined ? {} : { reason }) });
  }
  public dispose(): void {
    this.engine.dispose();
    this.#listeners.clear();
  }
  #emit(event: Parameters<DragEventListener>[0]): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}
