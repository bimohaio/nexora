import { describe, expect, it } from "vitest";
import { RuntimeAlarmEngine, type AlarmAggregate, type AlarmInput } from "../alarm/index.js";
import {
  AlarmVisualPresentationStore,
  AlarmVisualResolver,
  resolveAnimation,
  resolveBadge,
  resolveBorder,
  resolveFill,
  resolveIcon,
  resolveOverlay,
  resolvePresentation,
  resolveText,
  type AlarmTheme
} from "./index.js";

function input(overrides: Partial<AlarmInput> = {}): AlarmInput {
  return {
    alarmId: "alarm-1",
    symbolId: "symbol-1",
    connectionId: "connection-1",
    groupId: "group-1",
    layerId: "layer-1",
    sourceId: "pressure",
    sourceKind: "threshold",
    category: "process",
    severity: "high",
    timestamp: 100,
    status: "Active",
    message: "Pressure high",
    code: "PRESSURE_HIGH",
    origin: "plc",
    reason: "condition-active",
    ...overrides
  };
}
function aggregate(overrides: Partial<AlarmInput> = {}): AlarmAggregate {
  const engine = new RuntimeAlarmEngine({ now: () => 100 });
  engine.evaluate(input(overrides));
  const resolved = engine.snapshot.symbols.get(overrides.symbolId ?? "symbol-1");
  if (resolved === undefined) throw new Error("Expected alarm aggregate.");
  return resolved;
}

describe("alarm visual pure resolution", () => {
  it("resolves a complete immutable renderer-neutral presentation", () => {
    const presentation = resolvePresentation({ aggregate: aggregate(), revision: 2 });
    expect(presentation).toMatchObject({
      effectiveSeverity: "high",
      badge: { kind: "triangle", token: "alarm.high.badge" },
      overlay: { kind: "outline" },
      border: { kind: "severity", thickness: 2 },
      icon: { kind: "alarm" },
      criticalHighlight: false,
      warningOverlay: true
    });
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(JSON.stringify(presentation)).not.toMatch(/svg|canvas|css|html|dom/i);
  });

  it("exposes every pure resolver independently", () => {
    const resolved = aggregate({ severity: "critical", category: "electrical" });
    expect(resolveBadge(resolved).kind).toBe("diamond");
    expect(resolveOverlay(resolved).token).toBe("alarm.critical.overlay");
    expect(resolveBorder(resolved)).toMatchObject({ emphasized: true, thickness: 3 });
    expect(resolveFill(resolved).patternToken).toBe("alarm.critical.pattern");
    expect(resolveText(resolved).weight).toBe("bold");
    expect(resolveAnimation(resolved).requests).toEqual(["blink", "flash", "pulse", "glow"]);
    expect(resolveIcon(resolved).kind).toBe("electrical");
  });

  it("maps emergency and multiple alarms to semantic overlay and badges", () => {
    const engine = new RuntimeAlarmEngine({ now: () => 100 });
    engine.evaluateMany([
      input({ alarmId: "a", severity: "emergency" }),
      input({ alarmId: "b", severity: "low", timestamp: 101 })
    ]);
    const symbolAggregate = engine.snapshot.symbols.get("symbol-1");
    if (symbolAggregate === undefined) throw new Error("Expected symbol aggregate.");
    const resolved = resolvePresentation({ aggregate: symbolAggregate, revision: 1 });
    expect(resolved.badge).toMatchObject({ kind: "count", count: 2, label: "2" });
    expect(resolved.fill.textureRequest).toBe(true);
    expect(resolved.decoration.labelEmphasis).toBe("critical");
  });

  it("uses category and operating status for semantic icons", () => {
    expect(
      resolvePresentation({ aggregate: aggregate({ category: "security" }), revision: 1 }).icon.kind
    ).toBe("security");
    expect(
      resolvePresentation({
        aggregate: aggregate({ status: "Offline", quality: "offline", category: "communication" }),
        revision: 1
      }).icon.kind
    ).toBe("offline");
    expect(
      resolvePresentation({ aggregate: aggregate(), revision: 1, statusOverride: "Maintenance" })
        .icon.kind
    ).toBe("maintenance");
  });

  it("replaces all motion with static non-color emphasis under reduced motion", () => {
    const presentation = resolvePresentation({
      aggregate: aggregate({ severity: "emergency" }),
      revision: 1,
      motionPreference: "reduce"
    });
    expect(presentation.animation).toEqual({
      requests: [],
      reducedMotion: true,
      staticFallback: true
    });
    expect(presentation.text).toMatchObject({ blink: false, outline: true, contrastBoost: true });
    expect(presentation.badge.kind).not.toBe("none");
    expect(presentation.border.emphasized).toBe(true);
  });

  it("honors theme aliases without hardcoded colors", () => {
    const theme: AlarmTheme = {
      id: "night",
      tokens: { "alarm.high.fill": "theme.night.danger.fill" }
    };
    const presentation = resolvePresentation({ aggregate: aggregate(), revision: 1, theme });
    expect(presentation.fill.token).toBe("theme.night.danger.fill");
    expect(presentation.border.token).toBe("alarm.high.stroke");
    expect(JSON.stringify(presentation)).not.toMatch(/#[0-9a-f]{3,8}|rgb\(/i);
  });

  it("applies disabled above offline and severity presentation", () => {
    const presentation = resolvePresentation({
      aggregate: aggregate({ severity: "emergency" }),
      revision: 1,
      statusOverride: "Disabled"
    });
    expect(presentation).toMatchObject({
      effectiveSeverity: "none",
      effectiveStatus: "Disabled",
      decoration: { opacityOverride: 0.5 },
      animation: { requests: [] }
    });
  });

  it("is deterministic for repeated resolution", () => {
    const resolved = aggregate({ severity: "critical" });
    const resolver = new AlarmVisualResolver();
    expect(resolver.resolve({ aggregate: resolved, revision: 1 })).toEqual(
      resolver.resolve({ aggregate: resolved, revision: 1 })
    );
  });
});

describe("incremental alarm visual snapshots", () => {
  it("updates only changed symbols and all configured scopes", () => {
    const alarmEngine = new RuntimeAlarmEngine({ now: () => 100 });
    const initial = alarmEngine.evaluateMany([
      input({ alarmId: "a", symbolId: "s-a" }),
      input({ alarmId: "b", symbolId: "s-b" })
    ]);
    const visuals = new AlarmVisualPresentationStore({ now: () => 100 });
    visuals.apply(initial.snapshot, initial.diff);
    const stable = visuals.snapshot.symbols.get("s-b");
    const changed = alarmEngine.evaluate(
      input({ alarmId: "a", symbolId: "s-a", severity: "critical", timestamp: 200 })
    );
    const update = visuals.apply(changed.snapshot, changed.diff);
    expect(update.diff?.changedSymbolIds).toEqual(["s-a"]);
    expect(update.snapshot.symbols.get("s-b")).toBe(stable);
    expect(update.snapshot.symbols.get("s-a")?.effectiveSeverity).toBe("critical");
    expect(update.snapshot.connections.size).toBe(1);
    expect(update.snapshot.groups.size).toBe(1);
    expect(update.snapshot.layers.size).toBe(1);
  });

  it("reprojects tokens on theme change without changing alarm revision", () => {
    const alarmEngine = new RuntimeAlarmEngine({ now: () => 100 });
    const result = alarmEngine.evaluate(input());
    const visuals = new AlarmVisualPresentationStore();
    visuals.apply(result.snapshot, result.diff);
    const alarmRevision = visuals.snapshot.alarmRevision;
    const update = visuals.setTheme({
      id: "contrast",
      tokens: { "alarm.high.fill": "theme.contrast.alarm.fill" }
    });
    expect(update.diff?.reason).toBe("theme");
    expect(update.snapshot.alarmRevision).toBe(alarmRevision);
    expect(update.snapshot.symbols.get("symbol-1")?.fill.token).toBe("theme.contrast.alarm.fill");
  });

  it("reprojects motion policy without recalculating alarm state", () => {
    const alarmEngine = new RuntimeAlarmEngine({ now: () => 100 });
    const result = alarmEngine.evaluate(input({ severity: "critical" }));
    const visuals = new AlarmVisualPresentationStore();
    visuals.apply(result.snapshot, result.diff);
    const update = visuals.setMotionPreference("reduce");
    expect(update.diff?.reason).toBe("motion");
    expect(update.snapshot.alarmRevision).toBe(result.snapshot.revision);
    expect(update.snapshot.symbols.get("symbol-1")?.animation.requests).toEqual([]);
  });

  it("projects 10,000 alarms across 5,000 symbols and keeps subsequent diff targeted", () => {
    const alarmEngine = new RuntimeAlarmEngine({ now: () => 100 });
    const inputs = Array.from({ length: 10_000 }, (_, index) =>
      input({
        alarmId: `a-${index}`,
        symbolId: `s-${index % 5_000}`,
        connectionId: `c-${index % 100}`,
        groupId: `g-${index % 10}`,
        layerId: `l-${index % 5}`,
        timestamp: index + 1,
        severity: index % 13 === 0 ? "critical" : "low"
      })
    );
    const initial = alarmEngine.evaluateMany(inputs);
    const visuals = new AlarmVisualPresentationStore();
    const projected = visuals.apply(initial.snapshot, initial.diff);
    expect(projected.snapshot.symbols.size).toBe(5_000);
    const change = alarmEngine.evaluate(
      input({
        alarmId: "a-7",
        symbolId: "s-7",
        connectionId: "c-7",
        groupId: "g-7",
        layerId: "l-2",
        timestamp: 20_000,
        severity: "emergency"
      })
    );
    const update = visuals.apply(change.snapshot, change.diff);
    expect(update.diff).toMatchObject({
      changedSymbolIds: ["s-7"],
      changedConnectionIds: ["c-7"],
      changedGroupIds: ["g-7"],
      changedLayerIds: ["l-2"]
    });
  });
});
