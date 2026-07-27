import { describe, expect, it } from "vitest";
import { InMemoryTagStore, RuntimeBatchQueue } from "./index.js";

const scenarios = [
  { name: "small", symbols: 100, updates: 200 },
  { name: "medium", symbols: 1_000, updates: 2_000 },
  { name: "large", symbols: 5_000, updates: 10_000 }
] as const;

describe("deterministic runtime scalability benchmark", () => {
  for (const scenario of scenarios)
    it(`${scenario.name}: ${scenario.symbols} symbols / ${scenario.updates} updates`, () => {
      let now = 1_000;
      const store = new InMemoryTagStore({ now: () => now, defaultQuality: "good" });
      const queue = new RuntimeBatchQueue();
      for (let index = 0; index < scenario.updates; index += 1)
        queue.enqueue({
          key: `tag-${String(index % scenario.symbols).padStart(5, "0")}`,
          value: index,
          timestamp: now
        });
      const startedAt = performance.now();
      const result = store.updateMany(queue.flush());
      const elapsedMs = performance.now() - startedAt;
      const throughput = result.accepted / Math.max(elapsedMs / 1_000, 0.000_001);
      expect(result.rejected).toBe(0);
      expect(result.accepted).toBe(scenario.symbols);
      expect(store.snapshot().size).toBe(scenario.symbols);
      expect(Number.isFinite(throughput)).toBe(true);
      now += 1;
      store.dispose();
    });

  it("coalesces 10,000 simulator-style updates without retaining queue state", () => {
    const queue = new RuntimeBatchQueue();
    for (let index = 0; index < 10_000; index += 1)
      queue.enqueue({ key: `tag-${String(index % 1_000)}`, value: index });
    expect(queue.size).toBe(1_000);
    expect(queue.flush()).toHaveLength(1_000);
    expect(queue.size).toBe(0);
  });
});
