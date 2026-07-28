import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@web-scada/core";
import {
  InMemoryTagStore,
  type DataQuality,
  type RuntimeDataPoint
} from "@web-scada/runtime-engine";
import {
  BindingTypeRegistry,
  evaluateDirectBinding,
  evaluateDirectBindings,
  getDirectBindingDependencies,
  registerDirectBindingType,
  type DirectBindingDefinition,
  type RuntimeBindingValueReader
} from "./index.js";

const activeBinding = (
  overrides: Partial<DirectBindingDefinition> = {}
): DirectBindingDefinition => ({
  id: "binding_pump_active",
  source: { type: "tag", tagId: "plant.line1.pump.running" },
  target: { type: "node-property", nodeId: "node_pump_01", property: "active" },
  mode: "one-way",
  enabled: true,
  ...overrides
});

function point(
  value: JsonValue,
  quality: DataQuality = "good",
  timestamp = 1_000
): RuntimeDataPoint {
  return {
    key: "plant.line1.pump.running",
    value,
    quality,
    timestamp,
    ingestionTimestamp: timestamp
  };
}

function reader(
  value: RuntimeDataPoint | undefined,
  get = vi.fn(() => value)
): RuntimeBindingValueReader {
  return { revision: 7, timestamp: 2_000, get };
}

describe("direct binding evaluation", () => {
  it.each([
    ["boolean false", false, "active"],
    ["numeric zero", 0, "level"],
    ["negative number", -12.5, "speed"],
    ["empty string", "", "text"],
    ["plain security-looking text", "<script>alert(1)</script>", "text"]
  ])("resolves %s without truthiness or execution", (_label, value, property) => {
    const definition = activeBinding({
      target: { type: "node-property", nodeId: "node_pump_01", property }
    });
    const resolved = evaluateDirectBinding(definition, { runtime: reader(point(value)) });
    expect(resolved).toMatchObject({
      status: "resolved",
      value,
      revision: 7,
      source: { quality: "good", timestamp: 1_000, runtimeRevision: 7 }
    });
  });

  it("distinguishes missing values from explicit null", () => {
    const generic = activeBinding({
      target: { type: "node-property", nodeId: "node_pump_01", property: "custom" }
    });
    expect(evaluateDirectBinding(generic, { runtime: reader(undefined) }).status).toBe(
      "unresolved"
    );
    expect(evaluateDirectBinding(generic, { runtime: reader(point(null)) })).toMatchObject({
      status: "resolved",
      value: null
    });
    expect(evaluateDirectBinding(activeBinding(), { runtime: reader(point(null)) }).status).toBe(
      "invalid"
    );
  });

  it("uses only an explicit target-compatible fallback", () => {
    const valid = evaluateDirectBinding(activeBinding({ fallback: false }), {
      runtime: reader(undefined)
    });
    expect(valid.status).toBe("fallback");
    expect(valid.value).toBe(false);
    expect(valid.diagnostics.map(({ code }) => code)).toEqual([
      "BINDING_RUNTIME_VALUE_MISSING",
      "BINDING_FALLBACK_USED"
    ]);

    const invalid = evaluateDirectBinding(activeBinding({ fallback: "no" }), {
      runtime: reader(undefined)
    });
    expect(invalid.status).toBe("invalid");
    expect(invalid.diagnostics.at(-1)?.code).toBe("BINDING_INVALID_FALLBACK");
  });

  it("does not read runtime values for disabled or empty-key definitions", () => {
    const get = vi.fn<RuntimeBindingValueReader["get"]>();
    expect(
      evaluateDirectBinding(activeBinding({ enabled: false }), {
        runtime: reader(undefined, get)
      }).status
    ).toBe("disabled");
    expect(get).not.toHaveBeenCalled();

    expect(
      evaluateDirectBinding(activeBinding({ source: { type: "tag", tagId: " " } }), {
        runtime: reader(undefined, get)
      }).status
    ).toBe("invalid");
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["bad", "offline", "unknown"] as const)(
    "rejects %s quality and applies fallback",
    (quality) => {
      const resolved = evaluateDirectBinding(activeBinding({ fallback: false }), {
        runtime: reader(point(true, quality))
      });
      expect(resolved).toMatchObject({
        status: "fallback",
        value: false,
        source: { quality }
      });
    }
  );

  it.each(["good", "uncertain"] as const)("accepts %s quality", (quality) => {
    expect(
      evaluateDirectBinding(activeBinding(), {
        runtime: reader(point(true, quality))
      }).status
    ).toBe("resolved");
  });

  it("supports explicit rejected-quality acceptance and deterministic staleness", () => {
    expect(
      evaluateDirectBinding(activeBinding(), {
        runtime: reader(point(true, "unknown")),
        policies: { rejectedQuality: "accept" }
      }).status
    ).toBe("resolved");
    const stale = evaluateDirectBinding(activeBinding({ fallback: false }), {
      runtime: reader(point(true, "good", 1_000)),
      timestamp: 2_001,
      policies: { maximumAgeMs: 1_000 }
    });
    expect(stale.status).toBe("fallback");
    expect(stale.diagnostics[0]?.code).toBe("BINDING_RUNTIME_VALUE_STALE");
  });

  it("strictly validates known target types and finite numbers", () => {
    expect(evaluateDirectBinding(activeBinding(), { runtime: reader(point("true")) }).status).toBe(
      "invalid"
    );
    expect(
      evaluateDirectBinding(
        activeBinding({
          target: { type: "text", nodeId: "node_pump_01" }
        }),
        { runtime: reader(point(1)) }
      ).status
    ).toBe("invalid");
    expect(
      evaluateDirectBinding(
        activeBinding({
          target: {
            type: "connection-property",
            connectionId: "connection_01",
            property: "opacity"
          }
        }),
        {
          runtime: reader({
            ...point(1),
            value: Number.POSITIVE_INFINITY as never
          })
        }
      ).status
    ).toBe("invalid");
  });

  it("isolates reader exceptions and continues deterministic batches", () => {
    const throwing: RuntimeBindingValueReader = {
      revision: 4,
      get(key) {
        if (key === "broken") throw new Error("secret value must not escape");
        return point(true);
      }
    };
    const results = evaluateDirectBindings(
      [
        activeBinding({ id: "broken", source: { type: "tag", tagId: "broken" } }),
        activeBinding({ id: "working" })
      ],
      { runtime: throwing }
    );
    expect(results.map(({ status }) => status)).toEqual(["error", "resolved"]);
    expect(JSON.stringify(results[0])).not.toContain("secret value");
  });

  it("does not mutate definitions, policies, or Runtime Engine snapshots", () => {
    const store = new InMemoryTagStore({ now: () => 1_000, defaultQuality: "good" });
    store.update({ key: "plant.line1.pump.running", value: true, timestamp: 1_000 });
    const snapshot = store.snapshot();
    const definition = activeBinding();
    const policies = { maximumAgeMs: 2_000 } as const;
    const before = JSON.stringify(definition);
    const resolved = evaluateDirectBinding(definition, { runtime: snapshot, policies });
    expect(resolved.status).toBe("resolved");
    expect(JSON.stringify(definition)).toBe(before);
    expect(snapshot.get("plant.line1.pump.running")?.value).toBe(true);
    expect(policies.maximumAgeMs).toBe(2_000);
  });
});

describe("direct dependencies and registry", () => {
  it("extracts one dependency without runtime lookup", () => {
    expect(getDirectBindingDependencies(activeBinding())).toEqual([
      { kind: "runtime-value", key: "plant.line1.pump.running" }
    ]);
    expect(
      getDirectBindingDependencies(activeBinding({ source: { type: "tag", tagId: " " } }))
    ).toEqual([]);
  });

  it("registers the controlled direct contribution", () => {
    const registry = new BindingTypeRegistry();
    registerDirectBindingType(registry);
    expect(registry.get("direct")?.type).toBe("direct");
    expect(registry.get("tag")?.type).toBe("direct");
    expect(registry.get("direct")?.getDependencies?.(activeBinding())).toEqual([
      { kind: "runtime-value", key: "plant.line1.pump.running" }
    ]);
    expect(() => {
      registerDirectBindingType(registry);
    }).toThrow();
  });
});
