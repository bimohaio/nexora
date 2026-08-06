import { describe, expect, it } from "vitest";
import { ManualRuntimeScheduler } from "../scheduler.js";
import {
  AlarmSeverityRegistry,
  RuntimeAlarmEngine,
  aggregateAlarms,
  compareAlarmPriority,
  composeAlarmVisualSnapshot,
  resolveAlarm,
  resolveAlarmLifecycle,
  resolveSeverity,
  type AlarmInput,
  type RuntimeAlarm
} from "./index.js";

function input(overrides: Partial<AlarmInput> = {}): AlarmInput {
  return {
    alarmId: "a-1",
    symbolId: "pump-1",
    sourceId: "pressure",
    sourceKind: "threshold",
    category: "process",
    severity: "high",
    timestamp: 100,
    status: "Active",
    message: "Pressure high",
    code: "PRESSURE_HIGH",
    origin: "plc-1",
    reason: "condition-active",
    ...overrides
  };
}
function alarm(overrides: Partial<AlarmInput> = {}): RuntimeAlarm {
  return resolveAlarmLifecycle(undefined, input(overrides));
}

describe("alarm severity and lifecycle", () => {
  it("provides configurable immutable built-in severity definitions", () => {
    const registry = new AlarmSeverityRegistry();
    expect(registry.list().map(({ id }) => id)).toEqual([
      "none",
      "info",
      "low",
      "medium",
      "high",
      "critical",
      "emergency"
    ]);
    expect(Object.isFrozen(registry.list()[0])).toBe(true);
  });

  it("resolves severity independently of evaluation order", () => {
    const alarms = [
      alarm({ alarmId: "low", severity: "low" }),
      alarm({ alarmId: "emergency", severity: "emergency" }),
      alarm({ alarmId: "critical", severity: "critical" })
    ];
    const reordered = alarms.flatMap((_, index) => {
      const selected = alarms[[1, 0, 2][index] ?? index];
      return selected === undefined ? [] : [selected];
    });
    for (const permutation of [alarms, [...alarms].reverse(), reordered]) {
      expect(resolveSeverity(permutation)).toBe("emergency");
      expect(resolveAlarm(permutation)?.alarmId).toBe("emergency");
    }
  });

  it("uses stable priority, severity, ack, source, timestamp and alarm-id ordering", () => {
    const base = alarm({ priority: 5, sourcePriority: 2, timestamp: 100 });
    expect(compareAlarmPriority(alarm({ alarmId: "priority", priority: 6 }), base)).toBeLessThan(0);
    expect(
      compareAlarmPriority(alarm({ alarmId: "severity", severity: "critical", priority: 5 }), base)
    ).toBeLessThan(0);
    expect(
      compareAlarmPriority(alarm({ alarmId: "source", sourcePriority: 3, priority: 5 }), base)
    ).toBeLessThan(0);
    expect(resolveAlarm([alarm({ alarmId: "z" }), alarm({ alarmId: "a" })])?.alarmId).toBe("a");
  });

  it("follows active-unack, active-ack, returned-unack, normal lifecycle", () => {
    const engine = new RuntimeAlarmEngine({ now: () => 100 });
    expect(engine.evaluate(input()).snapshot.alarms.get("a-1")?.lifecycle).toBe("ACTIVE_UNACK");
    expect(engine.acknowledge("a-1", 110).snapshot.alarms.get("a-1")?.lifecycle).toBe("ACTIVE_ACK");
    expect(engine.clear("a-1", 120).snapshot.alarms.get("a-1")?.lifecycle).toBe("NORMAL");
    engine.evaluate(input({ alarmId: "a-2", timestamp: 130 }));
    expect(engine.clear("a-2", 140).snapshot.alarms.get("a-2")?.lifecycle).toBe("RETURNED_UNACK");
    expect(engine.acknowledge("a-2", 150).snapshot.alarms.get("a-2")?.lifecycle).toBe("NORMAL");
  });

  it("ignores out-of-order transitions", () => {
    const current = alarm({ timestamp: 200 });
    expect(resolveAlarmLifecycle(current, input({ timestamp: 199, severity: "emergency" }))).toBe(
      current
    );
  });

  it("deep-clones and freezes JSON metadata", () => {
    const nested = { labels: ["process"] };
    const resolved = alarm({ metadata: nested });
    nested.labels.push("mutated");
    expect(resolved.metadata).toEqual({ labels: ["process"] });
    expect(Object.isFrozen(resolved.metadata)).toBe(true);
    expect(Object.isFrozen(resolved.metadata.labels)).toBe(true);
  });
});

describe("runtime alarm engine", () => {
  it("coalesces updates through the shared scheduler and emits an incremental diff", () => {
    const scheduler = new ManualRuntimeScheduler({ now: () => 500 });
    const engine = new RuntimeAlarmEngine({ scheduler, now: () => 500 });
    engine.evaluate(input({ alarmId: "a", symbolId: "s-a" }));
    engine.evaluate(input({ alarmId: "b", symbolId: "s-b" }));
    expect(engine.snapshot.revision).toBe(0);
    expect(scheduler.pendingCount).toBe(1);
    const result = engine.flush();
    expect(result.diff).toMatchObject({
      fromRevision: 0,
      toRevision: 1,
      changedSymbolIds: ["s-a", "s-b"]
    });
    expect(result.diff?.changes.map(({ kind }) => kind)).toEqual(["activated", "activated"]);
  });

  it("aggregates symbol, connection, group, layer and document state", () => {
    const engine = new RuntimeAlarmEngine({ now: () => 1000 });
    engine.evaluateMany([
      input({
        alarmId: "a",
        symbolId: "s",
        connectionId: "c",
        groupId: "g",
        layerId: "l",
        severity: "medium"
      }),
      input({
        alarmId: "b",
        symbolId: "s",
        connectionId: "c",
        groupId: "g",
        layerId: "l",
        severity: "critical",
        timestamp: 101
      })
    ]);
    expect(engine.snapshot.symbols.get("s")).toMatchObject({
      effectiveSeverity: "critical",
      alarmCount: 2,
      ackRequired: true
    });
    expect(engine.snapshot.connections.get("c")?.visual).toMatchObject({
      blink: true,
      flash: true,
      badge: true
    });
    expect(engine.snapshot.groups.get("g")?.effectiveSeverity).toBe("critical");
    expect(engine.snapshot.layers.get("l")?.effectiveSeverity).toBe("critical");
    expect(engine.snapshot.document.alarmCount).toBe(2);
  });

  it("composes resolved alarm state into a renderer-neutral visual snapshot", () => {
    const engine = new RuntimeAlarmEngine({ now: () => 100 });
    engine.evaluate(input({ symbolId: "s", connectionId: "c" }));
    const empty = (): undefined => undefined;
    const visual = {
      revision: 1,
      timestamp: 90,
      nodes: new Map([["s", { properties: {}, quality: "good" as const }]]),
      connections: new Map([["c", { style: {}, quality: "good" as const }]]),
      getNodeState: empty,
      getNodeProperties: empty,
      getNodeVisibility: empty,
      getNodeQuality: empty,
      getConnectionStyle: empty,
      getConnectionVisibility: empty,
      getConnectionQuality: empty
    };
    const composed = composeAlarmVisualSnapshot(visual, engine.snapshot);
    expect(composed.nodes.get("s")?.alarmState?.effectiveSeverity).toBe("high");
    expect(composed.connections.get("c")?.alarmState?.alarmCount).toBe(1);
    expect(composed.alarmSnapshot).toBe(engine.snapshot);
    const originalNode = visual.nodes.get("s");
    expect(originalNode === undefined ? true : !("alarmState" in originalNode)).toBe(true);
  });

  it.each(["Shelved", "Disabled", "Suppressed", "Maintenance", "OutOfService", "Normal"] as const)(
    "excludes %s alarms from effective severity",
    (status) => {
      const resolved = aggregateAlarms([
        alarm({ status, severity: "emergency" }),
        alarm({ alarmId: "active", severity: "low" })
      ]);
      expect(resolved.effectiveSeverity).toBe("low");
    }
  );

  it("resolves offline and unknown quality deterministically", () => {
    const offline = alarm({
      alarmId: "offline",
      status: "Offline",
      quality: "offline",
      severity: "critical"
    });
    const unknown = alarm({
      alarmId: "unknown",
      status: "Unknown",
      quality: "unknown",
      severity: "high"
    });
    expect(resolveAlarm([unknown, offline])?.alarmId).toBe("offline");
  });

  it("publishes lifecycle events without allowing listener ordering into resolution", () => {
    const events: string[] = [];
    const engine = new RuntimeAlarmEngine({
      now: () => 100,
      onEvent: ({ type }) => events.push(type)
    });
    engine.evaluate(input());
    engine.acknowledge("a-1", 110);
    engine.clear("a-1", 120);
    expect(events).toEqual(["AlarmActivated", "Acknowledged", "AlarmCleared"]);
  });

  it("handles 10,000 alarms and only identifies changed scopes in a subsequent diff", () => {
    let now = 100;
    const engine = new RuntimeAlarmEngine({ now: () => now });
    const inputs = Array.from({ length: 10_000 }, (_, index) =>
      input({
        alarmId: `a-${index}`,
        symbolId: `s-${index % 5_000}`,
        timestamp: index + 1,
        severity: index % 11 === 0 ? "critical" : "low"
      })
    );
    const initial = engine.evaluateMany(inputs);
    expect(initial.snapshot.alarms.size).toBe(10_000);
    expect(initial.snapshot.symbols.size).toBe(5_000);
    now = 200;
    const changed = engine.evaluate(
      input({ alarmId: "a-7", symbolId: "s-7", timestamp: 10_001, severity: "emergency" })
    );
    expect(changed.diff?.changedSymbolIds).toEqual(["s-7"]);
    expect(changed.diff?.changes).toHaveLength(1);
  });

  it("is deterministic under randomized input ordering", () => {
    const severityIds = ["info", "low", "medium", "high", "critical"] as const;
    const source = Array.from({ length: 200 }, (_, index) =>
      alarm({
        alarmId: `alarm-${String(index).padStart(3, "0")}`,
        severity: severityIds[index % severityIds.length] ?? "info",
        timestamp: index % 17,
        priority: index % 3
      })
    );
    const expected = resolveAlarm(source)?.alarmId;
    for (let seed = 1; seed <= 25; seed += 1) {
      const shuffled = [...source].sort(
        (a, b) => ((a.alarmId.charCodeAt(7) * seed) % 31) - ((b.alarmId.charCodeAt(7) * seed) % 31)
      );
      expect(resolveAlarm(shuffled)?.alarmId).toBe(expected);
    }
  });

  it("rejects invalid identity, timestamps and unknown severity", () => {
    const engine = new RuntimeAlarmEngine();
    expect(() => engine.evaluate(input({ alarmId: "" }))).toThrow(TypeError);
    expect(() => engine.evaluate(input({ timestamp: Number.NaN }))).toThrow(TypeError);
    expect(() => engine.evaluate(input({ severity: "not-registered" }))).toThrow(TypeError);
  });
});
