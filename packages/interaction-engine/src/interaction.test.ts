import { describe, expect, it, vi } from "vitest";
import {
  BaseInteractionAdapter,
  InteractionContext,
  InteractionDispatcher,
  InteractionEvent,
  InteractionEventQueue,
  InteractionSession,
  InteractionSessionManager,
  InteractionStateStore,
  createInteractionState,
  type CoordinatePoint,
  type InteractionTarget
} from "./index.js";

const canvas: InteractionTarget = { id: "canvas", kind: "canvas" };
const node: InteractionTarget = { id: "node-1", kind: "node", parentId: "canvas" };
const makeEvent = (type = "pointer-down"): InteractionEvent =>
  new InteractionEvent({ type, timestamp: 1, target: node });

describe("InteractionDispatcher", () => {
  it("routes each event to the active session before listeners", () => {
    class EventSession extends InteractionSession<InteractionEvent, void> {
      public readonly log: string[] = [];
      protected onStart(): void {
        this.log.push("start");
      }
      protected onUpdate(): void {
        this.log.push("session");
      }
      protected onCommit(): void {
        this.log.push("commit");
      }
      protected onCancel(): void {
        this.log.push("cancel");
      }
      protected onDispose(): void {
        this.log.push("dispose");
      }
    }
    const sessions = new InteractionSessionManager();
    const session = new EventSession("event", "test");
    sessions.start(session);
    const dispatcher = new InteractionDispatcher(sessions);
    dispatcher.addListener(() => session.log.push("listener"), { phase: "target" });
    dispatcher.dispatch(makeEvent());
    expect(session.log).toEqual(["start", "session", "listener"]);
  });

  it("dispatches capture, target, and bubble deterministically", () => {
    const dispatcher = new InteractionDispatcher();
    const calls: string[] = [];
    dispatcher.addListener((event) => calls.push(`${event.phase}:${event.currentTarget.id}`));
    expect(dispatcher.dispatch(makeEvent(), [canvas, node])).toBe(true);
    expect(calls).toEqual(["capture:canvas", "target:node-1", "bubble:canvas"]);
  });

  it("orders by priority then registration, supports once, filters and cancellation", () => {
    const dispatcher = new InteractionDispatcher();
    const calls: string[] = [];
    dispatcher.addListener(() => calls.push("low"), { phase: "target" });
    dispatcher.once(
      (event) => {
        calls.push("high");
        event.preventDefault();
      },
      {
        type: "pointer-down",
        phase: "target",
        priority: 10,
        filter: (event) => event.target.kind === "node"
      }
    );
    expect(dispatcher.dispatch(makeEvent())).toBe(false);
    expect(dispatcher.dispatch(makeEvent())).toBe(true);
    expect(calls).toEqual(["high", "low", "low"]);
  });

  it("supports immediate propagation cancellation", () => {
    const dispatcher = new InteractionDispatcher();
    const second = vi.fn();
    dispatcher.addListener(
      (event) => {
        event.stopImmediatePropagation();
      },
      {
        phase: "target",
        priority: 1
      }
    );
    dispatcher.addListener(second, { phase: "target" });
    dispatcher.dispatch(makeEvent());
    expect(second).not.toHaveBeenCalled();
  });
});

class TestSession extends InteractionSession<number, number> {
  public log: string[] = [];
  protected onStart(): void {
    this.log.push("start");
  }
  protected onUpdate(input: Readonly<number>): void {
    this.log.push(`update:${input}`);
  }
  protected onCommit(): number {
    this.log.push("commit");
    return 7;
  }
  protected onCancel(reason?: string): void {
    this.log.push(`cancel:${reason ?? ""}`);
  }
  protected onDispose(): void {
    this.log.push("dispose");
  }
}

describe("InteractionSessionManager", () => {
  it("runs the full commit lifecycle", () => {
    const manager = new InteractionSessionManager();
    const session = new TestSession("one", "test");
    manager.start(session);
    session.update(2);
    expect(manager.commitCurrent()).toBe(7);
    expect(session.log).toEqual(["start", "update:2", "commit", "dispose"]);
    expect(manager.active).toBeUndefined();
  });

  it("cancels and disposes a replaced session", () => {
    const manager = new InteractionSessionManager();
    const first = new TestSession("one", "test");
    manager.start(first);
    manager.start(new TestSession("two", "test"));
    expect(first.log).toEqual(["start", "cancel:replaced", "dispose"]);
  });
});

describe("InteractionEventQueue", () => {
  it("batches, flushes, and cancels events", () => {
    const consumed: readonly number[][] = [];
    const queue = new InteractionEventQueue<number>((items) =>
      (consumed as number[][]).push([...items])
    );
    queue.batch([1, 2]);
    queue.flush();
    queue.enqueue(3);
    queue.cancel();
    queue.flush();
    expect(consumed).toEqual([[1, 2]]);
  });
});

describe("Interaction state and context", () => {
  it("replaces immutable state and notifies subscribers", () => {
    const store = new InteractionStateStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ activeSessionId: "session" });
    expect(store.value.activeSessionId).toBe("session");
    expect(Object.isFrozen(store.value)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("holds injected references without browser dependencies", () => {
    const point: CoordinatePoint = { x: 1, y: 2, space: "screen" };
    const context = new InteractionContext({
      hitTester: { hit: () => false, pick: () => undefined, pickMany: () => [] },
      coordinateConverter: { convert: () => point },
      options: { mode: "test" }
    });
    expect(context.coordinateConverter.convert(point, "canvas")).toBe(point);
    expect(Object.isFrozen(context)).toBe(true);
  });
});

class TestAdapter extends BaseInteractionAdapter<{ readonly accepted: boolean }> {
  public connects = 0;
  public disconnects = 0;
  public normalize(source: Readonly<{ readonly accepted: boolean }>): InteractionEvent | undefined {
    return source.accepted ? makeEvent() : undefined;
  }
  protected onConnect(): void {
    this.connects++;
  }
  protected onDisconnect(): void {
    this.disconnects++;
  }
}

describe("InteractionAdapter", () => {
  it("normalizes sources and disconnects idempotently", () => {
    const adapter = new TestAdapter();
    const listener = vi.fn();
    adapter.connect(listener);
    adapter.emit({ accepted: false });
    adapter.emit({ accepted: true });
    adapter.dispose();
    adapter.dispose();
    expect(listener).toHaveBeenCalledOnce();
    expect(adapter.connects).toBe(1);
    expect(adapter.disconnects).toBe(1);
  });
});

describe("pointer normalization contracts", () => {
  it("stores a renderer-independent pointer", () => {
    const position: CoordinatePoint = { x: 4, y: 5, space: "viewport" };
    const state = createInteractionState({
      currentPointer: {
        id: 3,
        buttons: 1,
        pressure: 0.5,
        tiltX: 2,
        tiltY: 3,
        type: "pen",
        primary: true,
        position,
        modifiers: {
          shift: true,
          control: false,
          alt: false,
          meta: false,
          capsLock: false,
          numLock: false,
          scrollLock: false
        }
      }
    });
    expect(state.currentPointer?.position.space).toBe("viewport");
    expect(state.currentPointer?.type).toBe("pen");
  });
});
