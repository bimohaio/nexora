import { describe, expect, it } from "vitest";
import { BrowserDemoDiagnostics } from "./browser-demo-diagnostics.js";

describe("BrowserDemoDiagnostics", () => {
  it("reports bounded public-event telemetry", () => {
    const diagnostics = new BrowserDemoDiagnostics();
    diagnostics.renderStarted(0);
    diagnostics.renderCompleted(4);
    diagnostics.renderStarted(16);
    diagnostics.renderCompleted(20);
    diagnostics.update({
      dirtyObjects: 2,
      runtimeRevision: 7,
      activeAnimations: 3,
      activeAlarms: 1,
      memoryCounters: 100,
      rendererInstances: 2
    });
    expect(diagnostics.snapshot()).toEqual({
      fps: 63,
      averageRenderTimeMs: 4,
      dirtyObjects: 2,
      runtimeRevision: 7,
      activeAnimations: 3,
      activeAlarms: 1,
      memoryCounters: 100,
      rendererInstances: 2
    });
  });
});
