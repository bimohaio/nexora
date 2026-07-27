import { describe, expect, it } from "vitest";
import { InMemoryTagStore } from "../../packages/runtime-engine/src/index.js";

describe("Runtime Engine medium-state performance fixture", () => {
  it("commits and snapshots 10,000 normalized keys as one revision without a timing assertion", () => {
    const store = new InMemoryTagStore({ now: () => 1000, defaultQuality: "good" });
    const inputs = Array.from({ length: 10_000 }, (_, index) => ({
      key: `plant.tag.${String(index).padStart(5, "0")}`,
      value: index,
      timestamp: 1000
    }));
    const result = store.updateMany(inputs);
    expect(result).toMatchObject({
      changed: true,
      revision: 1,
      accepted: 10_000,
      rejected: 0
    });
    expect(result.changeSet?.addedKeys).toHaveLength(10_000);
    expect(store.snapshot()).toMatchObject({ revision: 1, size: 10_000 });

    expect(store.update({ key: "plant.tag.05000", value: -1, timestamp: 1001 })).toMatchObject({
      changed: true,
      revision: 2
    });
    expect(store.snapshot().get("plant.tag.05000")?.value).toBe(-1);
    store.dispose();
  });
});
