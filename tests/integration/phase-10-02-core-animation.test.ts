import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnimationPrimitiveFactory,
  AnimationPrimitiveRegistry,
  InterpolationRegistry,
  ManualAnimationClock,
  ManualAnimationFrameDriver,
  PrimitiveSchedulerAdapter,
  SharedAnimationScheduler,
  asPrimitiveId
} from "@web-scada/animation-engine";
import type {
  AnimationPrimitive,
  PrimitiveConfiguration,
  PrimitiveDiagnostic,
  PrimitiveInstanceId
} from "@web-scada/animation-engine";
import type { ScadaDocument } from "@web-scada/core";

const primitiveId = asPrimitiveId("animation.integration-number");
class IntegrationPrimitive implements AnimationPrimitive<number> {
  public readonly id = primitiveId;
  public validate(
    _configuration: Readonly<PrimitiveConfiguration<number>>
  ): readonly PrimitiveDiagnostic[] {
    return [];
  }
  public evaluate(context: {
    readonly configuration: PrimitiveConfiguration<number>;
    readonly directedProgress: number;
  }): number {
    return (
      context.configuration.from +
      (context.configuration.to - context.configuration.from) * context.directedProgress
    );
  }
}

describe("Phase 10_02 core animation integration", () => {
  it("flows registry to factory to one shared scheduler task without mutating the document", () => {
    const document = {
      id: "document",
      schemaVersion: 1,
      nodes: [],
      connections: [],
      layers: [],
      bindings: []
    } as unknown as ScadaDocument;
    const persistedBefore = JSON.stringify(document);
    const registry = new AnimationPrimitiveRegistry();
    registry.register<number>({
      metadata: {
        id: primitiveId,
        displayName: "Integration",
        description: "Integration primitive.",
        version: "1",
        engineCompatibility: "*",
        supportedDirections: ["normal"],
        supportedFillModes: ["both"],
        supportedInterpolations: ["linear"]
      },
      factory: () => new IntegrationPrimitive()
    });
    const clock = new ManualAnimationClock();
    const driver = new ManualAnimationFrameDriver();
    const invalidations: string[] = [];
    const scheduler = new SharedAnimationScheduler({
      timeSource: clock,
      frameDriver: driver,
      invalidationSink: {
        commit: (batch) => {
          invalidations.push(...batch.invalidations.map((entry) => entry.targetId));
        }
      }
    });
    const instance = new AnimationPrimitiveFactory(registry, new InterpolationRegistry()).create({
      id: "integration-instance" as PrimitiveInstanceId,
      primitiveId,
      configuration: {
        timing: { durationMs: 100, fillMode: "both" },
        from: 0,
        to: 10
      },
      context: { clock }
    });
    const values: (number | undefined)[] = [];
    const adapter = new PrimitiveSchedulerAdapter<number>(scheduler);
    adapter.attach({
      instance,
      onResult: (value) => {
        values.push(value);
      },
      invalidation: { targetType: "node", targetId: "pump-1", reason: "test-value" }
    });
    clock.set(0);
    driver.fireFrame(0);
    clock.set(50);
    driver.fireFrame(50);
    clock.set(100);
    driver.fireFrame(100);
    expect(values).toEqual([0, 5, 10]);
    expect(invalidations).toEqual(["pump-1", "pump-1", "pump-1"]);
    expect(scheduler.getSnapshot().activeTaskIds).toHaveLength(0);
    expect(JSON.stringify(document)).toBe(persistedBefore);
    scheduler.dispose();
  });

  it("keeps executable primitive sources free of timing loops and renderer dependencies", () => {
    for (const file of [
      "primitive-contracts.ts",
      "interpolation.ts",
      "timeline.ts",
      "primitive-registry.ts",
      "primitive-instance.ts",
      "composite.ts",
      "events.ts",
      "object-pool.ts",
      "scheduler-adapter.ts"
    ]) {
      const source = readFileSync(resolve("packages/animation-engine/src", file), "utf8");
      expect(source).not.toMatch(
        /requestAnimationFrame|setInterval|Date\.now|performance\.now|SVGElement|DOMMatrix|@web-scada\/(?:renderer-svg|runtime-engine|binding-engine|datasource)/
      );
    }
  });
});
