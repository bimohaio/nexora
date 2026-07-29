import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagedSimulatorProvider, createBrowserSimulatorScenario } from "./simulated-provider.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("browser simulator state adapter", () => {
  it("creates a deterministic complete scenario with no credentials", () => {
    const scenario = createBrowserSimulatorScenario();
    expect(scenario).toHaveLength(18);
    expect(new Set(scenario.map(({ address }) => address.key)).size).toBe(18);
    expect(JSON.stringify(scenario)).not.toMatch(/password|token|secret|authorization/i);
    expect(scenario.find(({ address }) => address.key === "process.raw-tank.level")).toMatchObject({
      generator: { type: "sine", minimum: 0.38, maximum: 0.86 }
    });
  });

  it("projects manager diagnostics, bounds current values, and cleans simulator timers", async () => {
    vi.useFakeTimers();
    const provider = new ManagedSimulatorProvider();
    const values: string[] = [];
    const keys = createBrowserSimulatorScenario().map(({ address }) => address.key);
    await provider.connect();
    const unsubscribe = provider.subscribe(keys, (value) => values.push(value.tagId));
    await vi.runOnlyPendingTimersAsync();
    expect(new Set(values).size).toBe(18);
    expect(provider.getRecentValues()).toHaveLength(18);
    expect(provider.getDiagnostics().sources[0]).toMatchObject({
      descriptor: { id: "browser-simulator", adapterType: "simulator" },
      activeSubscriptions: 1
    });

    provider.setQuality("bad");
    expect(provider.getRecentValues().every(({ quality }) => quality === "bad")).toBe(true);
    unsubscribe();
    await provider.dispose();
    expect(provider.getDiagnostics().manager.state).toBe("disposed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
