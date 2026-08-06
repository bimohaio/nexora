import { describe, expect, it, vi } from "vitest";
import {
  RuntimeVisibilityManager,
  VisibilitySchedulerAdapter,
  resolveAccessibilityPresentation,
  resolveAnimationPermission,
  resolveContrast,
  resolveMotionPolicy,
  resolveViewportVisibility,
  resolveVisibility,
  type VisibilityInput
} from "./index.js";

const viewport = { x: 0, y: 0, width: 100, height: 100, zoom: 1 };
function input(id: string, x = 0, overrides: Partial<VisibilityInput> = {}): VisibilityInput {
  return { entityId: id, bounds: { x, y: 0, width: 20, height: 20 }, viewport, ...overrides };
}
describe("runtime visibility policies", () => {
  it("resolves motion preferences in documented priority order", () => {
    expect(
      resolveMotionPolicy({
        system: "reduced-motion",
        application: "minimal-motion",
        document: "static-mode",
        user: "accessibility-mode",
        runtimeOverride: "diagnostic-mode"
      })
    ).toBe("diagnostic-mode");
    expect(resolveMotionPolicy({ system: "reduced-motion", application: "minimal-motion" })).toBe(
      "minimal-motion"
    );
    expect(resolveMotionPolicy({})).toBe("full-motion");
  });
  it("resolves viewport visibility, partial intersection and zoom", () => {
    expect(resolveViewportVisibility({ x: 10, y: 10, width: 20, height: 20 }, viewport)).toEqual({
      state: "visible",
      fraction: 1
    });
    expect(resolveViewportVisibility({ x: 90, y: 0, width: 20, height: 20 }, viewport)).toEqual({
      state: "partially-visible",
      fraction: 0.5
    });
    expect(resolveViewportVisibility({ x: 101, y: 0, width: 20, height: 20 }, viewport).state).toBe(
      "outside-viewport"
    );
    expect(
      resolveViewportVisibility({ x: 51, y: 0, width: 10, height: 10 }, { ...viewport, zoom: 2 })
        .state
    ).toBe("outside-viewport");
  });
  it.each([
    [{ documentVisible: false }, "hidden"],
    [{ layerVisible: false }, "hidden"],
    [{ groupVisible: false }, "hidden"],
    [{ collapsed: true }, "collapsed"],
    [{ disabled: true }, "disabled"],
    [{ occluded: true }, "occluded"]
  ] as const)("resolves structural visibility %#", (override, expected) => {
    expect(resolveVisibility(input("s", 0, override)).state).toBe(expected);
  });
  it("pauses invisible work without losing state and preserves critical alarm cues", () => {
    expect(resolveAnimationPermission("outside-viewport", "full-motion")).toMatchObject({
      scheduler: "pause",
      animation: false
    });
    expect(resolveAnimationPermission("visible", "static-mode")).toMatchObject({
      scheduler: "run",
      animation: false
    });
    expect(resolveAccessibilityPresentation("static-mode", true)).toEqual({
      preserveAlarmVisibility: true,
      staticBorder: true,
      solidOverlay: true,
      contrastBorder: true,
      priorityBadge: true,
      statusRibbon: true,
      labelHighlight: true,
      accessibilityIcon: true
    });
    expect(resolveContrast("high-contrast")).toMatchObject({
      token: "contrast.normal",
      colorIndependent: true,
      patternIndicator: true
    });
  });
  it("updates only affected entries and retains unaffected identity", () => {
    const manager = new RuntimeVisibilityManager({ now: () => 1 });
    manager.updateMany([input("a"), input("b")]);
    const stable = manager.snapshot.entries.get("b");
    const update = manager.update(input("a", 200));
    expect(update.diff?.changedEntityIds).toEqual(["a"]);
    expect(update.snapshot.entries.get("b")).toBe(stable);
    expect(update.snapshot.entries.get("a")?.optimization).toMatchObject({
      cull: true,
      pauseAnimation: true,
      retainState: true
    });
    expect(update.snapshot.diagnostics).toMatchObject({
      totalSymbols: 2,
      hiddenSymbols: 1,
      pausedAnimations: 1,
      changedNodes: 1
    });
  });
  it("maps incremental visibility and motion to scheduler capabilities", () => {
    const target = { setEntityVisibility: vi.fn(), setReducedMotion: vi.fn() };
    const adapter = new VisibilitySchedulerAdapter(target);
    const manager = new RuntimeVisibilityManager();
    adapter.apply(manager.updateMany([input("visible"), input("offscreen", 200)]));
    expect(target.setEntityVisibility).toHaveBeenCalledWith("visible", "visible");
    expect(target.setEntityVisibility).toHaveBeenCalledWith("offscreen", "offscreen");
    adapter.apply(manager.setMotionPreferences({ user: "reduced-motion" }));
    expect(target.setReducedMotion).toHaveBeenLastCalledWith("reduce");
  });
  it("processes 50,000 symbols deterministically", () => {
    const manager = new RuntimeVisibilityManager({ now: () => 1 });
    const inputs = Array.from({ length: 50_000 }, (_, index) =>
      input(`s-${index}`, index % 2 === 0 ? 0 : 200)
    );
    const result = manager.updateMany(inputs);
    expect(result.snapshot.entries.size).toBe(50_000);
    expect(result.snapshot.diagnostics).toMatchObject({
      visibleSymbols: 25_000,
      hiddenSymbols: 25_000,
      pausedAnimations: 25_000
    });
    const stable = result.snapshot.entries.get("s-2");
    const changed = manager.update(input("s-1", 0));
    expect(changed.diff?.changedEntityIds).toEqual(["s-1"]);
    expect(changed.snapshot.entries.get("s-2")).toBe(stable);
  });

  it("resolves 100,000 animation permissions without retaining requests", () => {
    let allowed = 0;
    for (let index = 0; index < 100_000; index += 1)
      if (
        resolveAnimationPermission(index % 2 === 0 ? "visible" : "outside-viewport", "full-motion")
          .animation
      )
        allowed += 1;
    expect(allowed).toBe(50_000);
    const manager = new RuntimeVisibilityManager({ now: () => 1 });
    const first = manager.update(input("stable"));
    const repeated = manager.update(input("stable"));
    expect(repeated.changed).toBe(false);
    expect(repeated.snapshot).toBe(first.snapshot);
  });
});
