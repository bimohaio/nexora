import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InMemoryAnimationTypeRegistry,
  validateAnimationDefinition
} from "@web-scada/animation-engine";
import {
  InMemoryAlarmSeverityRegistry,
  asAlarmId,
  asAlarmSeverityId,
  resolveAlarmVisualState
} from "@web-scada/alarm-visualization";
import type { ScadaDocument } from "@web-scada/core";
import { createTestAlarmState } from "../../packages/alarm-visualization/src/testing.js";
import {
  TestMotionPreferenceSource,
  createTestAnimationDefinition
} from "../../packages/animation-engine/src/testing.js";

describe("Phase 10 foundation integration", () => {
  it("connects binding-shaped output to a safe animation trigger", () => {
    const bindingOutput = {
      entityId: "motor-1",
      target: "running",
      value: true,
      quality: "good",
      timestamp: 100,
      revision: 3
    } as const;
    const definition = createTestAnimationDefinition({
      target: { entityId: bindingOutput.entityId, kind: "node", property: "rotation" },
      trigger: {
        kind: "runtime-boolean",
        bindingId: bindingOutput.target,
        expected: bindingOutput.value
      }
    });
    expect(validateAnimationDefinition(definition, new InMemoryAnimationTypeRegistry()).valid).toBe(
      true
    );
  });

  it("connects runtime quality alarm state to a static reduced-motion visual", () => {
    const motion = new TestMotionPreferenceSource("reduce");
    const state = createTestAlarmState({
      alarmId: asAlarmId("motor-offline"),
      severity: asAlarmSeverityId("critical"),
      quality: "offline"
    });
    const visual = resolveAlarmVisualState({
      entityId: "motor-1",
      state,
      motionPreference: motion.getCurrent(),
      rule: {
        severity: asAlarmSeverityId("critical"),
        animation: { definitionId: "flash" },
        overlay: "border",
        indicator: "icon",
        reducedMotionFallback: {
          emphasis: "critical",
          overlay: "pattern",
          indicator: "label"
        }
      }
    });
    expect(new InMemoryAlarmSeverityRegistry().rank(state.severity)).toBe(40);
    expect(visual.alarm?.animationDefinitionId).toBeUndefined();
    expect(visual.alarm).toMatchObject({ overlay: "pattern", indicator: "label" });
  });

  it("does not mutate persisted design state while resolving runtime visuals", () => {
    const document = {
      id: "doc",
      schemaVersion: 1,
      nodes: [],
      connections: [],
      layers: [],
      bindings: []
    } as unknown as ScadaDocument;
    const before = JSON.stringify(document);
    resolveAlarmVisualState({
      entityId: "pump",
      state: createTestAlarmState(),
      motionPreference: "no-preference",
      rule: { severity: asAlarmSeverityId("alarm"), overlay: "border", indicator: "icon" }
    });
    expect(JSON.stringify(document)).toBe(before);
  });

  it("keeps generic packages free of renderer, UI and protocol imports", () => {
    for (const file of [
      "packages/animation-engine/src/contracts.ts",
      "packages/alarm-visualization/src/contracts.ts"
    ]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).not.toMatch(
        /@web-scada\/(?:renderer-svg|designer-engine|web-components|datasource-(?:mqtt|modbus|opcua|rest|websocket))|(?:from|import)\s+["'](?:vue|react)["']/
      );
      expect(source).not.toMatch(/\b(?:SVGElement|CSSStyleDeclaration|DOMMatrix)\b/);
    }
  });

  it("prevents symbol-owned interval and frame loops", () => {
    for (const file of [
      "packages/symbols/src/symbol.ts",
      "packages/symbols/src/industrial-symbols.ts",
      "packages/renderer-svg/src/industrial-symbol-renderers.ts",
      "packages/renderer-svg/src/symbol-renderers.ts"
    ]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).not.toMatch(/\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/);
    }
  });
});
