import { describe, expect, it } from "vitest";
import { ManualAnimationClock, ManualAnimationFrameDriver } from "@web-scada/animation-engine";
import {
  InMemorySymbolRegistry,
  createBuiltInSymbolAnimationMetadata,
  type SymbolDefinition
} from "@web-scada/symbols";
import { DesignerAnimationPreviewController } from "./animation-preview.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

const tank: SymbolDefinition = {
  type: "process.vertical-tank",
  displayNameKey: "tank",
  category: "tank",
  defaultWidth: 100,
  defaultHeight: 100,
  minimumWidth: 10,
  minimumHeight: 10,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal"],
  animation: createBuiltInSymbolAnimationMetadata(["level"])
};

describe("DesignerAnimationPreviewController", () => {
  it("uses the production runtime path for play, pause, seek, speed, restart and stop", () => {
    const document = createDesignerTestDocument(1);
    const original = JSON.stringify(document);
    const symbols = new InMemorySymbolRegistry();
    symbols.register(tank);
    const clock = new ManualAnimationClock();
    const frameDriver = new ManualAnimationFrameDriver();
    const samples: unknown[] = [];
    const preview = new DesignerAnimationPreviewController({
      document,
      symbols,
      timeSource: clock,
      frameDriver,
      onSamples: (_id, values) => samples.push(values)
    });

    preview.play("node_0", "level");
    frameDriver.fireFrame(0);
    preview.seek("node_0", "level", 0.5);
    expect(samples.at(-1)).toMatchObject([{ channel: "level", value: 0.5 }]);
    preview.setSpeedOverride(2, "node_0");
    preview.pause();
    preview.resume();
    preview.restart("node_0", "level");
    preview.stop("node_0");
    expect(samples.at(-1)).toEqual([]);
    expect(JSON.stringify(document)).toBe(original);
    preview.dispose();
  });

  it("validates preview controls and rejects use after disposal", () => {
    const symbols = new InMemorySymbolRegistry();
    symbols.register(tank);
    const preview = new DesignerAnimationPreviewController({
      document: createDesignerTestDocument(1),
      symbols,
      frameDriver: new ManualAnimationFrameDriver()
    });
    expect(() => { preview.seek("node_0", "level", 2); }).toThrow(RangeError);
    expect(() => { preview.setSpeedOverride(-1); }).toThrow(RangeError);
    preview.dispose();
    expect(() => { preview.play("node_0", "level"); }).toThrow(/disposed/);
  });
});
