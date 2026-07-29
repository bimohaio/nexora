import { describe, expect, it } from "vitest";
import {
  DefaultAlarmPriorityResolver,
  InMemoryAlarmSeverityRegistry,
  acknowledgeAlarm,
  asAlarmId,
  asAlarmSeverityId,
  canTransitionAlarmLifecycle,
  resolveAlarmVisualState,
  validateAlarmDefinition,
  validateAlarmState
} from "./index.js";
import { createTestAlarmState } from "./testing.js";

describe("alarm visualization foundation", () => {
  const severities = new InMemoryAlarmSeverityRegistry();

  it("provides stable semantic severity ordering without colors", () => {
    expect(severities.list().map(({ id, rank }) => [id, rank])).toEqual([
      ["information", 10],
      ["warning", 20],
      ["alarm", 30],
      ["critical", 40]
    ]);
    expect(JSON.stringify(severities.list())).not.toMatch(/color|#[0-9a-f]/i);
  });

  it("validates definitions, conditions and static visual cues", () => {
    const definition = {
      id: asAlarmId("pressure-high"),
      source: { kind: "binding" as const, sourceId: "pressure" },
      condition: { kind: "threshold" as const, operator: ">" as const, threshold: 100 },
      severity: asAlarmSeverityId("critical"),
      visual: {
        severity: asAlarmSeverityId("critical"),
        overlay: "border" as const,
        indicator: "icon" as const,
        animation: { definitionId: "critical-flash" },
        reducedMotionFallback: {
          emphasis: "critical" as const,
          overlay: "border" as const,
          indicator: "icon" as const
        }
      }
    };
    expect(validateAlarmDefinition(definition, severities).valid).toBe(true);
    expect(
      validateAlarmDefinition(
        { ...definition, condition: { kind: "threshold", operator: ">", threshold: Infinity } },
        severities
      ).valid
    ).toBe(false);
  });

  it("validates lifecycle consistency, acknowledgment and shelving timestamps", () => {
    expect(validateAlarmState(createTestAlarmState(), severities).valid).toBe(true);
    expect(
      validateAlarmState(
        createTestAlarmState({
          lifecycle: "inactive",
          active: true,
          shelving: "shelved-until"
        }),
        severities
      ).issues.map(({ code }) => code)
    ).toEqual(
      expect.arrayContaining(["ALARM_ACTIVE_STATE_INCONSISTENT", "ALARM_SHELVING_TIME_MISSING"])
    );
    expect(canTransitionAlarmLifecycle("active", "returned-to-normal")).toBe(true);
    expect(canTransitionAlarmLifecycle("active", "inactive")).toBe(false);
  });

  it("acknowledges transient state immutably", () => {
    const original = createTestAlarmState();
    const acknowledged = acknowledgeAlarm(original, 120);
    expect(acknowledged).not.toBe(original);
    expect(acknowledged).toMatchObject({
      acknowledgment: "acknowledged",
      acknowledgedAt: 120,
      revision: 2
    });
    expect(original.acknowledgment).toBe("unacknowledged");
  });

  it("resolves alarm priority deterministically", () => {
    const resolver = new DefaultAlarmPriorityResolver(severities);
    const resolved = resolver.resolve([
      createTestAlarmState({
        alarmId: asAlarmId("warning"),
        severity: asAlarmSeverityId("warning"),
        activatedAt: 200
      }),
      createTestAlarmState({
        alarmId: asAlarmId("critical"),
        severity: asAlarmSeverityId("critical"),
        activatedAt: 100
      })
    ]);
    expect(resolved.primary?.alarmId).toBe("critical");
  });

  it("removes motion while retaining non-color alarm semantics", () => {
    const state = createTestAlarmState({ severity: asAlarmSeverityId("critical") });
    const rule = {
      severity: asAlarmSeverityId("critical"),
      animation: { definitionId: "flash" },
      overlay: "border" as const,
      indicator: "icon" as const,
      reducedMotionFallback: {
        emphasis: "critical" as const,
        overlay: "pattern" as const,
        indicator: "label" as const
      }
    };
    const resolved = resolveAlarmVisualState({
      entityId: "pump",
      state,
      rule,
      motionPreference: "reduce"
    });
    expect(resolved.alarm).toMatchObject({
      overlay: "pattern",
      indicator: "label",
      emphasis: "critical"
    });
    expect(resolved.alarm?.animationDefinitionId).toBeUndefined();
    expect(resolved.accessibility?.label).toContain("critical alarm");
  });

  it("round-trips persisted definition but keeps current state separate", () => {
    const definition = {
      id: asAlarmId("a"),
      source: { kind: "quality" as const, sourceId: "pump" },
      condition: { kind: "quality" as const, qualities: ["bad" as const, "offline" as const] },
      severity: asAlarmSeverityId("alarm")
    };
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expect(JSON.stringify(definition)).not.toMatch(/activatedAt|acknowledgedAt|revision/);
  });
});
