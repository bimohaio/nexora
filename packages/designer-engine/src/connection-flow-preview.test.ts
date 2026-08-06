import { describe, expect, it } from "vitest";
import type { ScadaDocument } from "@web-scada/core";
import {
  DesignerConnectionFlowPreviewController,
  type ConnectionFlowPreviewRuntime
} from "./connection-flow-preview.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

function flowDocument(): ScadaDocument {
  const base = createDesignerTestDocument(0);
  return {
    ...base,
    connections: [
      {
        id: "connection-1",
        name: "Flow",
        source: { nodeId: "a", portId: "a" },
        target: { nodeId: "b", portId: "b" },
        routing: "direct",
        waypoints: [],
        medium: "water",
        direction: "forward",
        style: {},
        flowAnimation: { id: "preview-flow", mode: "dash", primitive: "scalar" },
        layerId: base.layers[0]?.id ?? "layer_default",
        visible: true,
        locked: false
      }
    ]
  };
}

describe("DesignerConnectionFlowPreviewController", () => {
  it("supports preview controls without mutating the document", () => {
    const document = flowDocument();
    const original = JSON.stringify(document);
    let disposed = false;
    const calls: string[] = [];
    const runtime: ConnectionFlowPreviewRuntime = {
      loadDocument: () => {
        calls.push("load");
      },
      update: (_id, update) => {
        calls.push(`update:${JSON.stringify(update)}`);
      },
      pause: () => {
        calls.push("pause");
      },
      resume: () => {
        calls.push("resume");
      },
      controller: () => ({
        stop: () => {
          calls.push("stop");
        },
        mount: () => {
          calls.push("mount");
        },
        seek: (progress) => {
          calls.push(`seek:${String(progress)}`);
        }
      }),
      dispose: () => {
        disposed = true;
      }
    };
    const preview = new DesignerConnectionFlowPreviewController({
      document,
      runtime
    });
    preview.play("connection-1");
    preview.seek("connection-1", 0.5);
    preview.setSpeedOverride("connection-1", 2);
    preview.setDirection("connection-1", "reverse");
    preview.pause();
    preview.resume();
    preview.restart("connection-1");
    expect(preview.propertyInspectorValue("connection-1")).toMatchObject({ mode: "dash" });
    expect(calls).toContain("seek:0.5");
    expect(JSON.stringify(document)).toBe(original);
    preview.dispose();
    expect(disposed).toBe(true);
    expect(() => {
      preview.play("connection-1");
    }).toThrow(/disposed/);
  });
});
