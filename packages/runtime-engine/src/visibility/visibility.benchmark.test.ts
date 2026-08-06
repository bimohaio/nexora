import { describe, expect, it } from "vitest";
import { resolveAnimationPermission } from "./resolvers.js";
import { RuntimeVisibilityManager } from "./visibility-manager.js";

describe("visibility optimization benchmark", () => {
  it("projects 50,000 symbols and 100,000 animation permissions incrementally", () => {
    const manager = new RuntimeVisibilityManager({ now: () => 1 });
    const viewport = { x: 0, y: 0, width: 100, height: 100, zoom: 1 };
    const initial = manager.updateMany(
      Array.from({ length: 50_000 }, (_, index) => ({
        entityId: `symbol-${String(index)}`,
        bounds: { x: index % 2 === 0 ? 0 : 200, y: 0, width: 10, height: 10 },
        viewport
      }))
    );
    let runnable = 0;
    for (let index = 0; index < 100_000; index += 1)
      if (
        resolveAnimationPermission(index % 2 === 0 ? "visible" : "outside-viewport", "full-motion")
          .animation
      )
        runnable += 1;
    expect(initial.snapshot.entries.size).toBe(50_000);
    expect(runnable).toBe(50_000);
    const incremental = manager.update({
      entityId: "symbol-1",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      viewport
    });
    expect(incremental.diff?.changedEntityIds).toEqual(["symbol-1"]);
  });
});
