/* eslint-disable @typescript-eslint/no-deprecated -- legacy registry compatibility coverage */
// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createSvgRenderer } from "@web-scada/renderer-svg";
import {
  RuntimeSymbolVisualStateResolver,
  type RuntimeVisualSnapshot
} from "../../packages/runtime-engine/src/index.js";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import { createRendererTestDocument } from "../../packages/renderer-svg/src/renderer.test-helper.js";

describe("runtime visual-state integration", () => {
  it("resolves raw source data before incrementally updating the SVG renderer", () => {
    const document = createRendererTestDocument();
    const symbols = createExampleSymbolRegistry();
    const resolver = new RuntimeSymbolVisualStateResolver({
      targets: document.nodes.map(({ id, symbolType }) => ({ symbolId: id, symbolType })),
      symbols
    });
    const container = documentImplementation.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 500 }
    });
    documentImplementation.body.append(container);
    const renderer = createSvgRenderer({ symbols });
    renderer.mount(container);
    renderer.renderDocument(document);
    const node = renderer.getElementForNode("node_a");
    const shape = node?.querySelector("rect");

    const resolved = resolver.resolve("node_a", [
      {
        sourceId: "simulator",
        alarm: true,
        properties: { fill: "#ef4444" }
      }
    ]);
    expect(resolved).toBeDefined();
    if (resolved === undefined) return;
    const nodes = new Map([["node_a", resolved]]);
    const snapshot: RuntimeVisualSnapshot = {
      revision: 1,
      timestamp: 100,
      nodes,
      connections: new Map(),
      getNodeVisualState: (id) => (id === "node_a" ? resolved : undefined),
      getNodeState: (id) => nodes.get(id)?.effectiveState,
      getNodeProperties: (id) => nodes.get(id)?.properties,
      getNodeVisibility: (id) => nodes.get(id)?.visible,
      getNodeQuality: (id) => nodes.get(id)?.quality,
      getConnectionStyle: () => undefined,
      getConnectionVisibility: () => undefined,
      getConnectionQuality: () => undefined
    };
    renderer.renderRuntimeChanges(snapshot, {
      fromRevision: 0,
      toRevision: 1,
      addedNodeIds: [],
      updatedNodeIds: ["node_a"],
      removedNodeIds: [],
      addedConnectionIds: [],
      updatedConnectionIds: [],
      removedConnectionIds: [],
      reset: false
    });

    expect(renderer.getElementForNode("node_a")).toBe(node);
    expect(node?.querySelector("rect")).toBe(shape);
    expect(shape?.getAttribute("fill")).toBe("#ef4444");
    expect(node?.classList.contains("scada-state-alarm")).toBe(true);
    renderer.dispose();
  });
});

const documentImplementation = globalThis.document;
/* Legacy registry is intentional compatibility coverage. */
