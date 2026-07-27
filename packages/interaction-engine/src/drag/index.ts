import type { Point } from "@web-scada/geometry";
import type { PointerState } from "../pointer/index.js";
import { DragError } from "../errors/index.js";
import { DragSession, type DragSessionOptions } from "../sessions/drag-session.js";
import type { DragCommitResult, DragState } from "../types/drag.js";

export interface StartDragInput {
  readonly pointer: PointerState;
  readonly draggedIds: readonly string[];
  readonly anchor?: Point;
  readonly viewportRevision?: number;
}

export class DragEngine {
  #session: DragSession | undefined;
  #disposed = false;

  public constructor(private readonly options: DragSessionOptions) {}

  public get state(): DragState | undefined {
    return this.#session?.state;
  }

  public start(input: StartDragInput): DragState {
    this.#assertUsable();
    if (this.#session !== undefined)
      throw new DragError("DRAG_ALREADY_ACTIVE", "A drag session is already active.");
    const session = new DragSession({
      ...this.options,
      pointer: input.pointer,
      draggedIds: input.draggedIds,
      anchor: input.anchor ?? input.pointer.coordinates.world,
      viewportRevision: input.viewportRevision ?? 0
    });
    session.start();
    this.#session = session;
    return session.state;
  }

  public update(pointer: PointerState): DragState {
    this.#assertUsable();
    const session = this.#requireSession();
    session.update(pointer);
    return session.state;
  }

  public commit(): DragCommitResult {
    this.#assertUsable();
    const session = this.#requireSession();
    try {
      return session.commit();
    } finally {
      session.dispose();
      this.#session = undefined;
    }
  }

  public cancel(reason?: string): void {
    const session = this.#session;
    if (session === undefined) return;
    session.cancel(reason);
    session.dispose();
    this.#session = undefined;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.cancel("engine-disposed");
    this.#disposed = true;
  }

  #requireSession(): DragSession {
    if (this.#session === undefined)
      throw new DragError("DRAG_NOT_ACTIVE", "No drag session is active.");
    return this.#session;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new DragError("DRAG_DISPOSED", "Drag engine is disposed.");
  }
}
