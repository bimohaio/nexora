// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { ManualAnimationClock, ManualAnimationFrameDriver } from "@web-scada/animation-engine";
import { createIndustrialSymbolEnvironment } from "@web-scada/renderer-svg";
import { RuntimeAnimationShowcase } from "./animation-showcase.js";
import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";

describe("RuntimeAnimationShowcase", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("discovers metadata slots and drives them through one production runtime manager", () => {
    const { symbolRegistry } = createIndustrialSymbolEnvironment();
    const elements = new Map<string, SVGGElement>();
    for (const node of WATER_TREATMENT_DOCUMENT.nodes) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "g");
      element.dataset.scadaSymbol = "";
      element.setAttribute(
        "transform",
        `translate(${String(node.transform.x)} ${String(node.transform.y)})`
      );
      document.body.append(element);
      elements.set(node.id, element);
    }
    const clock = new ManualAnimationClock();
    const frameDriver = new ManualAnimationFrameDriver();
    const originalDocument = JSON.stringify(WATER_TREATMENT_DOCUMENT);
    const showcase = new RuntimeAnimationShowcase({
      document: WATER_TREATMENT_DOCUMENT,
      symbols: symbolRegistry,
      renderer: { getElementForNode: (nodeId) => elements.get(nodeId) },
      entityIds: new Set(
        WATER_TREATMENT_DOCUMENT.nodes
          .filter(({ id }) => id.startsWith("node_animation_"))
          .map(({ id }) => id)
      ),
      timeSource: clock,
      frameDriver
    });

    showcase.play();
    const playing = showcase.getSnapshot();
    expect(playing.animatedSymbolCount).toBe(6);
    expect(playing.activeSlotCount).toBe(6);
    expect(frameDriver.pendingCount).toBe(1);
    frameDriver.fireFrame(0);
    clock.set(500);
    frameDriver.fireFrame(500);
    expect(elements.get("node_animation_fan")?.getAttribute("transform")).toContain("rotate(180)");
    expect(elements.get("node_animation_pipe")?.getAttribute("stroke-dashoffset")).not.toBeNull();

    showcase.setSpeed(2);
    showcase.setReducedMotion("reduce");
    showcase.pause();
    expect(showcase.getSnapshot()).toMatchObject({
      state: "paused",
      speed: 2,
      reducedMotion: "reduce"
    });
    showcase.resume();
    showcase.restart();
    showcase.stop();
    expect(showcase.getSnapshot()).toMatchObject({ state: "stopped", activeSlotCount: 0 });
    expect(elements.get("node_animation_fan")?.getAttribute("transform")).toBe(
      "translate(900 660)"
    );
    expect(JSON.stringify(WATER_TREATMENT_DOCUMENT)).toBe(originalDocument);
    showcase.dispose();
    expect(showcase.getSnapshot().state).toBe("disposed");
    expect(() => {
      showcase.play();
    }).toThrow(/disposed/);
  });

  it("rejects invalid speed overrides", () => {
    const { symbolRegistry } = createIndustrialSymbolEnvironment();
    const showcase = new RuntimeAnimationShowcase({
      document: WATER_TREATMENT_DOCUMENT,
      symbols: symbolRegistry,
      renderer: { getElementForNode: () => undefined },
      frameDriver: new ManualAnimationFrameDriver()
    });
    expect(() => {
      showcase.setSpeed(-1);
    }).toThrow(RangeError);
    showcase.dispose();
  });
});
