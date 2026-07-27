import { describe, expect, it, vi } from "vitest";
import { KeyboardDiagnostics } from "../diagnostics/keyboard-diagnostics.js";
import { FocusEngine } from "../focus/index.js";
import { KeyMap } from "../maps/index.js";
import { NavigationEngine } from "../navigation/index.js";
import { CustomFocusPolicy } from "../policies/focus-policies.js";
import { SelectionManager } from "../selection/manager/index.js";
import { KeyboardAdapter } from "../services/keyboard-adapter.js";
import type { FocusTarget } from "../types/keyboard.js";
import { KeyboardEngine } from "./index.js";

const targets: readonly FocusTarget[] = [
  { id: "hidden", kind: "node", order: 0, hidden: true },
  { id: "b", kind: "node", order: 2 },
  { id: "layer", kind: "layer", order: 1 },
  { id: "child", kind: "port", parentId: "b", order: 3 },
  { id: "locked", kind: "node", order: 4, locked: true }
];

function createEngine(): {
  readonly engine: KeyboardEngine;
  readonly focus: FocusEngine;
  readonly selection: SelectionManager;
  readonly diagnostics: KeyboardDiagnostics;
  readonly render: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
} {
  const diagnostics = new KeyboardDiagnostics(true);
  const selection = new SelectionManager();
  const focus = new FocusEngine({ diagnostics });
  const navigation = new NavigationEngine(focus, { selection, diagnostics });
  const render = vi.fn();
  const clear = vi.fn();
  const engine = new KeyboardEngine({
    focus,
    navigation,
    diagnostics,
    renderer: { updateKeyboardState: render, clearKeyboardState: clear }
  });
  engine.setTargets(targets);
  return { engine, focus, selection, diagnostics, render, clear };
}

describe("KeyboardEngine", () => {
  it("normalizes keys and tracks immutable key, modifier, repeat, and composition state", () => {
    const { engine, diagnostics } = createEngine();
    const adapter = new KeyboardAdapter(engine);
    const before = engine.state;
    const down = adapter.process("key-down", {
      key: "Left",
      code: "ArrowLeft",
      repeat: true,
      shiftKey: true,
      timeStamp: 10
    });
    expect(down.activeKey).toBe("ArrowLeft");
    expect(down.pressedKeys.has("ArrowLeft")).toBe(true);
    expect(down.modifiers.shift).toBe(true);
    expect(down.repeat).toBe(true);
    expect(Object.isFrozen(down)).toBe(true);
    expect(before.pressedKeys.size).toBe(0);

    const up = adapter.process("key-up", { key: "Left", timeStamp: 11 });
    expect(up.activeKey).toBeUndefined();
    expect(up.pressedKeys.size).toBe(0);
    adapter.composition("composition-start", 12);
    adapter.process("key-down", { key: "Tab", timeStamp: 13 });
    expect(engine.state.composing).toBe(true);
    adapter.composition("composition-end", 14);
    expect(diagnostics.snapshot().repeatCount).toBe(1);
  });

  it("traverses deterministic logical order and updates keyboard selection", () => {
    const { engine, focus, selection } = createEngine();
    engine.process({ type: "key-down", key: "Home", timestamp: 1 });
    expect(focus.state.target?.id).toBe("layer");
    engine.process({ type: "key-down", key: "Tab", timestamp: 2 });
    expect(focus.state.target?.id).toBe("b");
    expect(selection.getPrimary()?.id).toBe("b");
    engine.process({
      type: "key-down",
      key: "Tab",
      timestamp: 3,
      modifiers: { shift: true }
    });
    expect(focus.state.target?.id).toBe("layer");
    engine.process({ type: "key-down", key: "End", timestamp: 4 });
    expect(focus.state.target?.id).toBe("child");
    engine.process({ type: "key-down", key: "ArrowLeft", timestamp: 5 });
    expect(focus.state.target?.id).toBe("b");
    engine.process({ type: "key-down", key: "ArrowRight", timestamp: 6 });
    expect(focus.state.target?.id).toBe("child");
  });

  it("routes custom bindings once, respects active interactions, and handles escape", () => {
    const focus = new FocusEngine();
    const navigation = new NavigationEngine(focus);
    const activate = vi.fn();
    let active = true;
    const engine = new KeyboardEngine({
      focus,
      navigation,
      keyMap: new KeyMap([
        { key: "x", command: "activate" },
        { key: "Escape", command: "escape" }
      ]),
      interactionActive: () => active,
      onActivate: activate
    });
    engine.setTargets([{ id: "a", kind: "node" }]);
    focus.focus({ id: "a", kind: "node" });
    engine.process({ type: "key-down", key: "x", timestamp: 1 });
    expect(activate).not.toHaveBeenCalled();
    active = false;
    engine.process({ type: "key-down", key: "x", timestamp: 2 });
    engine.process({ type: "key-down", key: "x", timestamp: 2 });
    expect(activate).toHaveBeenCalledOnce();
    engine.process({ type: "key-down", key: "Escape", timestamp: 3 });
    expect(focus.state.target).toBeUndefined();
  });

  it("supports application focus filters and disposal", () => {
    const focus = new FocusEngine({
      policies: [new CustomFocusPolicy("nodes-only", ({ kind }) => kind === "node")]
    });
    focus.setTargets(targets);
    expect(focus.state.order).toEqual(["node:b"]);
    focus.dispose();
    expect(() => focus.traverse("next")).toThrow("disposed");
  });
});
