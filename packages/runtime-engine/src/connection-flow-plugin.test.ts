import { describe, expect, it } from "vitest";
import { ConnectionFlowPluginRegistry } from "./connection-flow.js";

describe("ConnectionFlowPluginRegistry", () => {
  it("registers renderer-neutral modes, markers, renderers, diagnostics and previews", () => {
    const registry = new ConnectionFlowPluginRegistry();
    registry.registerMode({ id: "vendor.pulse" });
    registry.registerMarker({ id: "vendor.drop", kind: "shape" });
    registry.registerRenderer({ id: "vendor.canvas", apply: () => undefined });
    registry.registerDiagnostic({ id: "VENDOR_FLOW", describe: (message) => message });
    registry.registerPreviewProvider({ id: "vendor.preview", create: () => ({}) });
    expect(registry.hasMode("vendor.pulse")).toBe(true);
    expect(registry.markerCount).toBe(1);
    expect(registry.rendererCount).toBe(1);
    expect(registry.previewProviderCount).toBe(1);
  });
  it("rejects unsafe and duplicate plugin identifiers", () => {
    const registry = new ConnectionFlowPluginRegistry();
    expect(() => {
      registry.registerMode({ id: "<script>" });
    }).toThrow(TypeError);
    registry.registerMode({ id: "vendor.safe" });
    expect(() => {
      registry.registerMode({ id: "vendor.safe" });
    }).toThrow(TypeError);
  });
});
