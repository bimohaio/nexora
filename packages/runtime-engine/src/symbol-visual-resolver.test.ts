import { describe, expect, it, vi } from "vitest";
import { InMemorySymbolRegistry, type SymbolDefinition } from "@web-scada/symbols";
import {
  RuntimeSymbolVisualStateResolver,
  resolveSymbolVisualCapabilities
} from "./symbol-visual-resolver.js";

const capableSymbol: SymbolDefinition = {
  type: "test.capable",
  displayNameKey: "test.capable",
  category: "custom",
  defaultWidth: 10,
  defaultHeight: 10,
  minimumWidth: 1,
  minimumHeight: 1,
  ports: [],
  editableProperties: [],
  bindableProperties: [
    { key: "level", dataTypes: ["number"] },
    { key: "speed", dataTypes: ["number"] },
    { key: "text", dataTypes: ["string"] }
  ],
  supportedStates: [
    "normal",
    "active",
    "inactive",
    "running",
    "stopped",
    "warning",
    "alarm",
    "offline",
    "disabled"
  ],
  runtimeCapabilities: [
    "active",
    "running",
    "open",
    "disabled",
    "offline",
    "warning",
    "alarm",
    "level",
    "speed",
    "text"
  ]
};

function resolver(
  definition: SymbolDefinition = capableSymbol,
  onDiagnostic = vi.fn()
): {
  readonly resolver: RuntimeSymbolVisualStateResolver;
  readonly onDiagnostic: ReturnType<typeof vi.fn>;
} {
  const symbols = new InMemorySymbolRegistry();
  symbols.register(definition);
  return {
    resolver: new RuntimeSymbolVisualStateResolver({
      targets: [
        { symbolId: "pump", symbolType: definition.type },
        { symbolId: "valve", symbolType: definition.type }
      ],
      symbols,
      onDiagnostic
    }),
    onDiagnostic
  };
}

describe("RuntimeSymbolVisualStateResolver", () => {
  it("applies the deterministic disabled/offline/alarm/warning/operational priority", () => {
    const { resolver: visual } = resolver();
    expect(
      visual.resolve("pump", [
        {
          active: true,
          running: true,
          warning: true,
          alarm: true,
          offline: true,
          disabled: true
        }
      ])?.effectiveState
    ).toBe("disabled");
    expect(
      visual.resolve("pump", [{ active: true, warning: true, alarm: true, offline: true }])
        ?.effectiveState
    ).toBe("offline");
    expect(
      visual.resolve("pump", [{ active: true, warning: true, alarm: true }])?.effectiveState
    ).toBe("alarm");
    expect(visual.resolve("pump", [{ running: true, warning: true }])?.effectiveState).toBe(
      "warning"
    );
    expect(visual.resolve("pump", [{ running: true }])?.effectiveState).toBe("running");
    expect(visual.resolve("pump", [{ open: true }])?.effectiveState).toBe("active");
    expect(visual.resolve("pump", [{ running: false }])?.effectiveState).toBe("stopped");
  });

  it("merges ordered sources deterministically and merges their property bags", () => {
    const { resolver: visual } = resolver();
    const state = visual.resolve("pump", [
      {
        sourceId: "mqtt",
        priority: 10,
        timestamp: 100,
        running: true,
        properties: { speed: 100 }
      },
      {
        sourceId: "override-source",
        priority: 20,
        timestamp: 50,
        alarm: true,
        properties: { level: 0.8 }
      }
    ]);
    expect(state).toMatchObject({
      effectiveState: "alarm",
      running: true,
      alarm: true,
      properties: { speed: 100, level: 0.8 }
    });
  });

  it("supports immutable temporary overrides and restores source state when cleared", () => {
    const { resolver: visual } = resolver();
    const base = visual.resolve("pump", [{ running: true }]);
    expect(visual.setOverride("pump", { alarm: true })).toBe(true);
    const overridden = visual.get("pump");
    expect(overridden?.effectiveState).toBe("alarm");
    expect(Object.isFrozen(overridden?.overrides)).toBe(true);
    expect(overridden?.revision).toBeGreaterThan(base?.revision ?? 0);
    expect(visual.clearOverride("pump")).toBe(true);
    expect(visual.get("pump")?.effectiveState).toBe("running");
  });

  it("filters unsupported capabilities and reports invalid values, targets, and overrides", () => {
    const limited: SymbolDefinition = {
      ...capableSymbol,
      type: "test.limited",
      supportedStates: ["normal", "disabled"],
      runtimeCapabilities: ["disabled"],
      bindableProperties: []
    };
    const { resolver: visual, onDiagnostic } = resolver(limited);
    const state = visual.resolve("pump", [
      {
        alarm: true,
        level: Number.NaN,
        direction: "sideways",
        properties: { mystery: 1 }
      }
    ]);
    expect(state?.effectiveState).toBe("normal");
    expect(onDiagnostic).toHaveBeenCalledWith(
      "RUNTIME_VISUAL_CAPABILITY_UNSUPPORTED",
      expect.any(String),
      "pump",
      "alarm"
    );
    expect(onDiagnostic).toHaveBeenCalledWith(
      "RUNTIME_VISUAL_VALUE_INVALID",
      expect.any(String),
      "pump",
      "level"
    );
    expect(onDiagnostic).toHaveBeenCalledWith(
      "RUNTIME_VISUAL_PROPERTY_UNKNOWN",
      expect.any(String),
      "pump",
      "mystery"
    );
    expect(visual.resolve("missing", [])).toBeUndefined();
    expect(visual.setOverride("pump", { alarm: "yes" })).toBe(false);
    expect(onDiagnostic).toHaveBeenCalledWith(
      "RUNTIME_VISUAL_OVERRIDE_INVALID",
      expect.any(String),
      "pump"
    );
  });

  it("reuses unchanged cache entries and resolves only supplied incremental targets", () => {
    const { resolver: visual } = resolver();
    const first = visual.resolve("pump", [{ running: true, speed: 100 }]);
    const revision = visual.revision;
    const second = visual.resolve("pump", [{ running: true, speed: 100 }]);
    expect(second).toBe(first);
    expect(visual.revision).toBe(revision);
    const beforeCount = visual.resolutionCount;
    const changed = visual.resolveMany(new Map([["valve", [{ open: true }] as const]]));
    expect(changed.has("valve")).toBe(true);
    expect(visual.resolutionCount).toBe(beforeCount + 1);
    expect(visual.cacheSize).toBe(2);
  });

  it("derives renderer-neutral capabilities from symbol metadata", () => {
    expect(resolveSymbolVisualCapabilities(capableSymbol)).toMatchObject({
      supportsAlarm: true,
      supportsRunning: true,
      supportsLevel: true,
      supportsFlow: false
    });
  });
});
