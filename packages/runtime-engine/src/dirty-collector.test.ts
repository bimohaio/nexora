import { describe, expect, it } from "vitest";
import { RuntimeDirtyCollector } from "./dirty-collector.js";

describe("RuntimeDirtyCollector", () => {
  it("deduplicates categorized invalidations and derives entity dirtiness from diffs", () => {
    const collector = new RuntimeDirtyCollector();
    collector.add("AlarmDirty", "pump");
    collector.add("AlarmDirty", "pump");
    collector.addDiff({
      fromRevision: 1,
      toRevision: 2,
      addedNodeIds: [],
      updatedNodeIds: ["pump"],
      removedNodeIds: [],
      addedConnectionIds: [],
      updatedConnectionIds: ["pipe"],
      removedConnectionIds: [],
      reset: false
    });
    const state = collector.snapshot();
    expect(state.nodeIds).toEqual(["pump"]);
    expect(state.connectionIds).toEqual(["pipe"]);
    expect(state.categories.get("AlarmDirty")).toEqual(["pump"]);
  });

  it("collects 5,000 entity invalidations without entity-local scheduling", () => {
    const collector = new RuntimeDirtyCollector();
    const ids = Array.from({ length: 5_000 }, (_, index) => `node-${index}`);
    collector.addMany("AnimationDirty", ids);
    collector.addMany("NodeDirty", ids);
    const state = collector.snapshot();
    expect(state.nodeIds).toHaveLength(5_000);
    expect(state.categories.get("AnimationDirty")).toHaveLength(5_000);
  });
});
