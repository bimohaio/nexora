import { describe, expect, it } from "vitest";
import { AnimationComposite, validateCompositeGraph } from "./index.js";
import type { CompositeChildInstance, CompositeGraphNode } from "./index.js";

class FakeChild implements CompositeChildInstance {
  public state = "created";
  public progress = 0;
  public playCount = 0;
  public pauseCount = 0;
  public resumeCount = 0;
  public cancelCount = 0;
  public resetCount = 0;
  public disposeCount = 0;
  public reverseCount = 0;
  public seekValues: number[] = [];
  public rates: number[] = [];
  public updateCount = 0;
  public failuresRemaining = 0;
  public completeAfterUpdates = 1;

  public play(): void {
    this.playCount += 1;
    this.state = "running";
  }
  public pause(): void {
    this.pauseCount += 1;
    this.state = "paused";
  }
  public resume(): void {
    this.resumeCount += 1;
    this.state = "running";
  }
  public cancel(): void {
    this.cancelCount += 1;
    this.state = "cancelled";
  }
  public reset(): void {
    this.resetCount += 1;
    this.updateCount = 0;
    this.progress = 0;
    this.state = "created";
  }
  public restart(): void {
    this.reset();
    this.play();
  }
  public dispose(): void {
    this.disposeCount += 1;
    this.state = "disposed";
  }
  public reverse(): void {
    this.reverseCount += 1;
  }
  public seekProgress(progress: number): void {
    this.seekValues.push(progress);
    this.progress = progress;
  }
  public setPlaybackRate(rate: number): void {
    this.rates.push(rate);
  }
  public update(_currentTimeMs: number): Readonly<{ readonly complete: boolean }> {
    this.updateCount += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("deterministic failure");
    }
    this.progress = Math.min(1, this.updateCount / this.completeAfterUpdates);
    return { complete: this.progress === 1 };
  }
  public snapshot(): Readonly<{ readonly progress: number; readonly state: string }> {
    return { progress: this.progress, state: this.state };
  }
}

describe("advanced animation composite execution", () => {
  it("executes finite and infinite loops with deterministic alternate direction", () => {
    const child = new FakeChild();
    const finite = new AnimationComposite({
      id: "finite-loop",
      type: "parallel",
      children: [{ id: "child", instance: child }],
      repeat: { kind: "count", count: 3 },
      direction: "alternate"
    });
    finite.play(0);
    expect(finite.update(10)).toMatchObject({ state: "running", iteration: 1 });
    expect(child.resetCount).toBe(1);
    expect(child.reverseCount).toBe(1);
    expect(finite.update(20)).toMatchObject({ state: "running", iteration: 2 });
    expect(finite.update(30)).toMatchObject({ state: "completed", iteration: 2 });

    const infiniteChild = new FakeChild();
    const infinite = new AnimationComposite({
      id: "infinite-loop",
      type: "parallel",
      children: [{ id: "child", instance: infiniteChild }],
      repeat: { kind: "infinite" }
    });
    infinite.play(0);
    for (let time = 1; time <= 100; time += 1) infinite.update(time);
    expect(infinite.snapshot()).toMatchObject({ state: "running", iteration: 100 });
  });

  it("evaluates conditions at iteration boundaries and isolates predicate failures", () => {
    const enabled = new FakeChild();
    const disabled = new FakeChild();
    const broken = new FakeChild();
    const composite = new AnimationComposite({
      id: "conditional",
      type: "conditional",
      children: [
        { id: "enabled", instance: enabled, condition: () => true },
        { id: "disabled", instance: disabled, condition: () => false },
        {
          id: "broken",
          instance: broken,
          condition: () => {
            throw new Error("predicate");
          }
        }
      ],
      failurePolicy: { kind: "continue" }
    });
    composite.play(0);
    expect(composite.update(1)).toMatchObject({
      state: "completed",
      completedChildIds: ["enabled", "disabled"],
      failureCount: 1
    });
    expect(enabled.playCount).toBe(1);
    expect(disabled.playCount).toBe(0);
    expect(broken.playCount).toBe(0);
  });

  it("retries with scheduler time and deterministic exponential backoff", () => {
    const child = new FakeChild();
    child.failuresRemaining = 2;
    const composite = new AnimationComposite({
      id: "retry",
      type: "parallel",
      children: [{ id: "child", instance: child }],
      failurePolicy: {
        kind: "retry",
        maxAttempts: 2,
        delayMs: 10,
        backoffFactor: 2
      }
    });
    composite.play(0);
    expect(composite.update(0)).toMatchObject({ retryCount: 1, state: "running" });
    expect(composite.update(9).retryCount).toBe(1);
    expect(composite.update(10)).toMatchObject({ retryCount: 2, state: "running" });
    expect(composite.update(29).state).toBe("running");
    expect(composite.update(30)).toMatchObject({ state: "completed", retryCount: 2 });
    expect(child.resetCount).toBe(2);
  });

  it("runs fallback after exhausted retries and supports stop-on-failure", () => {
    const failing = new FakeChild();
    failing.failuresRemaining = 2;
    const fallback = new FakeChild();
    const retry = new AnimationComposite({
      id: "fallback",
      type: "parallel",
      children: [{ id: "failing", instance: failing }],
      failurePolicy: {
        kind: "retry",
        maxAttempts: 1,
        fallback
      }
    });
    retry.play(0);
    retry.update(0);
    expect(retry.update(1).state).toBe("running");
    expect(fallback.playCount).toBe(1);
    expect(retry.update(2).state).toBe("completed");

    const first = new FakeChild();
    first.failuresRemaining = 1;
    const sibling = new FakeChild();
    sibling.completeAfterUpdates = 10;
    const stop = new AnimationComposite({
      id: "stop",
      type: "parallel",
      children: [
        { id: "first", instance: first },
        { id: "sibling", instance: sibling }
      ],
      failurePolicy: { kind: "stop" }
    });
    stop.play(0);
    expect(stop.update(1).state).toBe("failed");
    expect(sibling.cancelCount).toBe(1);
  });

  it("propagates seek, reverse, speed, pause, resume, cancel and disposal in stable order", () => {
    const first = new FakeChild();
    const second = new FakeChild();
    const sequence = new AnimationComposite({
      id: "propagation",
      type: "sequence",
      children: [
        { id: "first", instance: first },
        { id: "second", instance: second }
      ]
    });
    sequence.play(0);
    expect(sequence.seekProgress(0.75)).toMatchObject({ progress: 0.75 });
    expect(first.seekValues).toEqual([1]);
    expect(second.seekValues).toEqual([0.5]);
    sequence.reverse();
    sequence.setPlaybackRate(2);
    sequence.pause();
    sequence.resume();
    sequence.cancel();
    sequence.dispose();
    expect(first.reverseCount).toBe(1);
    expect(second.reverseCount).toBe(1);
    expect(first.rates).toEqual([2]);
    expect(second.rates).toEqual([2]);
    expect(first.disposeCount).toBe(1);
    expect(second.disposeCount).toBe(1);
  });

  it("freezes composite offsets and retry deadlines while paused", () => {
    const first = new FakeChild();
    first.completeAfterUpdates = 100;
    const delayed = new FakeChild();
    const composite = new AnimationComposite({
      id: "pause-offsets",
      type: "stagger",
      staggerMs: 10,
      children: [
        { id: "first", instance: first },
        { id: "delayed", instance: delayed }
      ]
    });
    composite.play(0);
    composite.update(5);
    composite.pause(5);
    composite.resume(105);
    composite.update(109);
    expect(delayed.playCount).toBe(0);
    composite.update(110);
    expect(delayed.playCount).toBe(1);
  });

  it("executes nested composites and propagates terminal ownership", () => {
    const leaf = new FakeChild();
    const nested = new AnimationComposite({
      id: "nested",
      type: "parallel",
      children: [{ id: "leaf", instance: leaf }]
    });
    const root = new AnimationComposite({
      id: "root",
      type: "parallel",
      children: [{ id: "nested", instance: nested }]
    });
    root.play(0);
    expect(root.update(1).state).toBe("completed");
    expect(nested.snapshot().state).toBe("completed");
    root.dispose();
    expect(nested.snapshot().state).toBe("disposed");
    expect(leaf.disposeCount).toBe(1);
  });
});

describe("composite graph validation", () => {
  it("accepts deep acyclic graphs without recursive traversal", () => {
    let root: CompositeGraphNode = { id: "leaf", children: [] };
    for (let index = 0; index < 10_000; index += 1)
      root = { id: `node-${String(index)}`, children: [root] };
    expect(() => {
      validateCompositeGraph(root);
    }).not.toThrow();
  });

  it("rejects self references and indirect cycles", () => {
    const self = { id: "self", children: [] } as unknown as {
      id: string;
      children: CompositeGraphNode[];
    };
    self.children.push(self);
    expect(() => {
      validateCompositeGraph(self);
    }).toThrow(/cycle/);

    const first: { id: string; children: CompositeGraphNode[] } = {
      id: "first",
      children: []
    };
    const second: { id: string; children: CompositeGraphNode[] } = {
      id: "second",
      children: [first]
    };
    first.children.push(second);
    expect(() => {
      validateCompositeGraph(first);
    }).toThrow(/cycle/);
  });
});
