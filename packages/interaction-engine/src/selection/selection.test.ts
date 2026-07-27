import { describe, expect, it, vi } from "vitest";
import {
  InteractionDispatcher,
  InteractionEvent,
  MetadataSelectionPolicy,
  SelectionController,
  SelectionDiagnostics,
  SelectionChangingEvent,
  SelectionManager,
  type CoordinatePoint,
  type InteractionTarget
} from "../index.js";

const nodeA: InteractionTarget = { id: "a", kind: "node" };
const nodeB: InteractionTarget = { id: "b", kind: "node" };
const connection: InteractionTarget = { id: "c", kind: "connection" };
const position: CoordinatePoint = { x: 1, y: 2, space: "canvas" };

describe("SelectionManager", () => {
  it("supports single, multi, toggle, replace, remove, and clear", () => {
    const manager = new SelectionManager();
    manager.select(nodeA);
    expect(manager.getSelection()).toEqual([nodeA]);
    manager.selectMany([nodeB, connection], "add");
    expect(manager.getSelection()).toEqual([nodeA, nodeB, connection]);
    manager.toggle(nodeB);
    expect(manager.getSelection()).toEqual([nodeA, connection]);
    manager.selectMany([nodeA], "remove");
    expect(manager.getSelection()).toEqual([connection]);
    manager.replace([nodeB, nodeA]);
    expect(manager.getSelection()).toEqual([nodeB, nodeA]);
    manager.clear();
    expect(manager.isEmpty).toBe(true);
  });

  it("maintains stable order and primary selection", () => {
    const manager = new SelectionManager();
    manager.selectMany([nodeB, nodeA, nodeB], "replace");
    expect(manager.state.order).toEqual(["node:b", "node:a"]);
    expect(manager.getPrimary()).toBe(nodeB);
    manager.setPrimary(nodeA);
    expect(manager.getPrimary()).toBe(nodeA);
    expect(manager.getSelection()).toEqual([nodeB, nodeA]);
  });

  it("increments revision only for structural changes", () => {
    const manager = new SelectionManager();
    expect(manager.select(nodeA)).toBe(true);
    expect(manager.select(nodeA)).toBe(false);
    expect(manager.state.revision).toBe(1);
  });

  it("emits immutable ordered events and supports once observers", () => {
    const manager = new SelectionManager();
    const events: string[] = [];
    manager.subscribe((event) => events.push(event.type), { priority: 1 });
    const once = vi.fn();
    manager.once(once, { type: "selection-changed", priority: 10 });
    manager.select(nodeA);
    manager.select(nodeB);
    expect(events).toEqual([
      "selection-changing",
      "selection-added",
      "primary-selection-changed",
      "selection-changed",
      "selection-changing",
      "selection-added",
      "selection-removed",
      "primary-selection-changed",
      "selection-changed"
    ]);
    expect(once).toHaveBeenCalledOnce();
    expect(Object.isFrozen(manager.state)).toBe(true);
    expect(Object.isFrozen(manager.state.selection)).toBe(true);
  });

  it("allows an observer to cancel a transition", () => {
    const manager = new SelectionManager();
    manager.subscribe(
      (event) => {
        if (event instanceof SelectionChangingEvent) event.cancel();
      },
      { type: "selection-changing" }
    );
    expect(manager.select(nodeA)).toBe(false);
    expect(manager.state.revision).toBe(0);
  });

  it("composes metadata and application policies", () => {
    const manager = new SelectionManager({
      policies: [{ allows: (target) => target.id !== "blocked" }]
    });
    const locked: InteractionTarget = {
      id: "locked",
      kind: "node",
      metadata: { locked: true }
    };
    manager.selectMany([locked, { id: "blocked", kind: "custom" }, nodeA], "replace");
    expect(manager.getSelection()).toEqual([nodeA]);
    expect(new MetadataSelectionPolicy().allows(locked)).toBe(false);
  });

  it("tracks optional diagnostics", () => {
    const diagnostics = new SelectionDiagnostics(true);
    const manager = new SelectionManager({ diagnostics });
    manager.select(nodeA);
    const snapshot = diagnostics.snapshot(manager.size, manager.state.revision, 0);
    expect(snapshot.transitionCount).toBe(1);
    expect(snapshot.eventCount).toBe(4);
  });
});

describe("SelectionController integration", () => {
  it("consumes normalized interaction events through the dispatcher", () => {
    const pick = vi.fn(() => nodeA);
    const controller = new SelectionController({
      hitTester: { hit: () => true, pick, pickMany: () => [nodeA, nodeB] }
    });
    const dispatcher = new InteractionDispatcher();
    controller.attach(dispatcher);
    dispatcher.dispatch(
      new InteractionEvent({
        type: "pointer-down",
        timestamp: 1,
        target: { id: "canvas", kind: "canvas" },
        pointer: {
          id: 1,
          buttons: 1,
          pressure: 0,
          tiltX: 0,
          tiltY: 0,
          type: "mouse",
          primary: true,
          position,
          modifiers: {
            shift: false,
            control: false,
            alt: false,
            meta: false,
            capsLock: false,
            numLock: false,
            scrollLock: false
          }
        }
      })
    );
    expect(pick).toHaveBeenCalledOnce();
    expect(controller.manager.getSelection()).toEqual([nodeA]);
    expect(controller.selectManyAt(position)).toBe(true);
    expect(controller.manager.getSelection()).toEqual([nodeA, nodeB]);
  });
});
