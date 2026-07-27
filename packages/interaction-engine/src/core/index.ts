import { InteractionDispatcher } from "../dispatcher/index.js";
import type { InteractionEvent } from "../events/index.js";
import { InteractionSessionManager } from "../sessions/index.js";
import { InteractionStateStore, createInteractionState } from "../state/index.js";
import type { InteractionTarget } from "../types/index.js";
import { InteractionEventQueue } from "../utils/index.js";
import type { InteractionContext } from "../context/index.js";
import type { InteractionDiagnostics } from "../diagnostics/index.js";
import type { InteractionScheduler } from "../types/index.js";

export interface InteractionManagerOptions {
  readonly scheduler?: InteractionScheduler;
  readonly diagnostics?: InteractionDiagnostics;
}
export class InteractionManager {
  public readonly sessions = new InteractionSessionManager();
  public readonly dispatcher = new InteractionDispatcher(this.sessions);
  public readonly state = new InteractionStateStore(createInteractionState());
  readonly #queue: InteractionEventQueue<{
    event: InteractionEvent;
    path: readonly InteractionTarget[];
  }>;
  #disposed = false;
  public constructor(
    public readonly context: InteractionContext,
    options: InteractionManagerOptions = {}
  ) {
    this.#queue = new InteractionEventQueue(
      (entries) => {
        for (const { event, path } of entries) {
          const started = options.diagnostics?.beginDispatch();
          this.dispatcher.dispatch(event, path);
          options.diagnostics?.endDispatch(started);
        }
      },
      options.scheduler,
      {
        coalesceKey: ({ event }) => {
          if (event.type !== "pointer-move" && event.type !== "wheel" && event.type !== "focus")
            return undefined;
          return `${event.type}:${event.pointer?.id ?? 0}:${event.target.kind}:${event.target.id}`;
        },
        priority: ({ event }) =>
          event.type === "pointer-up" || event.type === "pointer-cancel"
            ? 100
            : event.type === "pointer-down" || event.type === "key-down"
              ? 80
              : event.type === "pointer-move"
                ? 50
                : 0
      }
    );
  }
  public dispatch(
    event: InteractionEvent,
    path: readonly InteractionTarget[] = [event.target]
  ): void {
    if (this.#disposed) throw new Error("Interaction manager is disposed.");
    this.#queue.enqueue({ event, path });
    if (this.#queue.size > 0 && this.#isImmediate(event)) this.#queue.flush();
  }
  public flush(): void {
    this.#queue.flush();
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#queue.dispose();
    this.dispatcher.dispose();
    this.state.dispose();
    this.#disposed = true;
  }
  #isImmediate(event: InteractionEvent): boolean {
    return (
      event.type === "pointer-down" ||
      event.type === "pointer-up" ||
      event.type === "key-down" ||
      event.type === "key-up"
    );
  }
}
