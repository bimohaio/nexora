// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { createEmptyChangeSet } from "@web-scada/core";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import {
  RendererError,
  createSvgRenderer,
  resolveEntityMetadata,
  type RendererEvent
} from "./index.js";
import { createRendererTestDocument } from "./renderer.test-helper.js";

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 800 },
    clientHeight: { value: 500 }
  });
  document.body.append(container);
  return container;
}

function expectRendererError(operation: () => void, code: string): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(RendererError);
    if (error instanceof RendererError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected renderer error: ${code}`);
}

describe("NativeSvgRenderer lifecycle and rendering", () => {
  it("validates renderer options", () => {
    expectRendererError(() => {
      createSvgRenderer({
        symbols: createExampleSymbolRegistry(),
        options: { minZoom: 2, maxZoom: 1 }
      });
    }, "RENDER_OPTIONS_INVALID");
  });

  it("guards lifecycle and disposes every owned resource", () => {
    const renderer = createSvgRenderer({ symbols: createExampleSymbolRegistry() });
    expectRendererError(() => {
      renderer.renderDocument(createRendererTestDocument());
    }, "RENDERER_NOT_MOUNTED");
    const container = createContainer();
    renderer.mount(container);
    expectRendererError(() => {
      renderer.mount(container);
    }, "RENDERER_ALREADY_MOUNTED");
    renderer.renderDocument(createRendererTestDocument());
    expect(container.querySelector("[data-scada-root]")).not.toBeNull();
    renderer.dispose();
    expect(container.childElementCount).toBe(0);
    expect(renderer.getElementForNode("node_a")).toBeUndefined();
    expectRendererError(() => {
      renderer.mount(container);
    }, "RENDERER_DISPOSED");
  });

  it("renders hierarchy, layers, nodes, ports, connections, locks, and fallback", () => {
    const events: RendererEvent[] = [];
    const renderer = createSvgRenderer({
      symbols: createExampleSymbolRegistry(),
      onEvent: (event) => {
        events.push(event);
      }
    });
    const container = createContainer();
    renderer.mount(container);
    renderer.renderDocument(createRendererTestDocument());
    const svg = renderer.getSvgElement();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.querySelector("[data-scada-defs]")).not.toBeNull();
    expect(svg?.querySelector("[data-scada-background]")).not.toBeNull();
    expect(svg?.querySelector("[data-scada-defs] pattern")).not.toBeNull();
    expect(svg?.querySelectorAll('[data-entity-type="layer"]')).toHaveLength(2);
    expect(svg?.querySelector<SVGGElement>('[data-layer-id="layer_hidden"]')?.style.display).toBe(
      "none"
    );
    expect(svg?.querySelectorAll('[data-entity-type="node"]')).toHaveLength(5);
    expect(renderer.getElementForNode("node_locked")?.dataset.locked).toBe("true");
    expect(renderer.getElementForPort("node_a", "outlet")).toBeDefined();
    expect(renderer.getElementForConnection("conn_direct")?.getAttribute("d")).toBe(
      "M 140 140 L 300 140"
    );
    expect(renderer.getElementForConnection("conn_manual")?.getAttribute("d")).toContain(
      "L 180 280"
    );
    expect(svg?.querySelectorAll('[data-hit-area="true"]')).toHaveLength(3);
    expect(events.some(({ type }) => type === "symbol-renderer-missing")).toBe(true);
    expect(events.some(({ type }) => type === "symbol-metadata-missing")).toBe(true);
    expect(renderer.getElementForNode("node_missing")?.textContent).toContain("vendor.missing");
  });

  it("preserves unrelated element identity and updates connected paths", () => {
    const renderer = createSvgRenderer({ symbols: createExampleSymbolRegistry() });
    renderer.mount(createContainer());
    const original = createRendererTestDocument();
    renderer.renderDocument(original);
    const unrelated = renderer.getElementForNode("node_b");
    const originalPath = renderer.getElementForConnection("conn_direct");
    const updated = {
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === "node_a" ? { ...node, transform: { ...node.transform, x: 80 } } : node
      )
    };
    renderer.renderChanges(updated, {
      ...createEmptyChangeSet(),
      updatedNodeIds: ["node_a"]
    });
    expect(renderer.getElementForNode("node_b")).toBe(unrelated);
    expect(renderer.getElementForConnection("conn_direct")).toBe(originalPath);
    expect(originalPath?.getAttribute("d")).toBe("M 180 140 L 300 140");

    renderer.renderChanges(
      { ...updated, nodes: updated.nodes.filter(({ id }) => id !== "node_a") },
      { ...createEmptyChangeSet(), removedNodeIds: ["node_a"] }
    );
    expect(renderer.getElementForNode("node_a")).toBeUndefined();
    expect(renderer.getElementForNode("node_b")).toBe(unrelated);
    expect(renderer.getElementForPort("node_a", "outlet")).toBeUndefined();
    expect(renderer.getElementForConnection("conn_direct")?.getAttribute("d")).toBe("");
  });

  it("keeps geometry, DOM identity, ordering, and layer cleanup conformant", () => {
    const renderer = createSvgRenderer({ symbols: createExampleSymbolRegistry() });
    renderer.mount(createContainer());
    const original = createRendererTestDocument();
    renderer.renderDocument(original);
    const nodeB = renderer.getElementForNode("node_b");
    const unrelatedConnection = renderer.getElementForConnection("conn_orthogonal");
    const processLayer = renderer
      .getSvgElement()
      ?.querySelector<SVGGElement>('[data-layer-id="layer_process"]');
    const definition = renderer.getSvgElement()?.querySelector("pattern");

    const scaled = {
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === "node_a"
          ? {
              ...node,
              transform: {
                ...node.transform,
                rotation: 90,
                scaleX: 2,
                scaleY: 0.5
              }
            }
          : node
      )
    };
    renderer.renderChanges(scaled, {
      ...createEmptyChangeSet(),
      updatedNodeIds: ["node_a"]
    });
    expect(renderer.getElementForNode("node_a")?.getAttribute("transform")).toBe(
      "translate(40 100) translate(50 40) rotate(90) scale(2 0.5) translate(-50 -40)"
    );
    expect(renderer.getElementForPort("node_a", "outlet")?.getAttribute("cx")).toBe("90");
    expect(renderer.getElementForPort("node_a", "outlet")?.getAttribute("cy")).toBe("240");
    expect(renderer.getElementForConnection("conn_direct")?.getAttribute("d")).toBe(
      "M 90 240 L 300 140"
    );
    expect(renderer.getElementForNode("node_b")).toBe(nodeB);
    expect(renderer.getElementForConnection("conn_orthogonal")).toBe(unrelatedConnection);
    expect(
      renderer.getSvgElement()?.querySelector<SVGGElement>('[data-layer-id="layer_process"]')
    ).toBe(processLayer);
    renderer.setViewport({ x: 10, y: 20, zoom: 1.5 });
    expect(renderer.getSvgElement()?.querySelector("pattern")).toBe(definition);

    const withoutHiddenLayer = {
      ...scaled,
      layers: scaled.layers.filter(({ id }) => id !== "layer_hidden"),
      nodes: scaled.nodes.filter(({ layerId }) => layerId !== "layer_hidden")
    };
    renderer.renderChanges(withoutHiddenLayer, {
      ...createEmptyChangeSet(),
      removedLayerIds: ["layer_hidden"],
      removedNodeIds: ["node_hidden"]
    });
    expect(renderer.getElementForNode("node_hidden")).toBeUndefined();
    expect(renderer.getSvgElement()?.querySelector('[data-layer-id="layer_hidden"]')).toBeNull();
  });

  it("supports viewport, resize, fit, options, runtime state, and pointer metadata", () => {
    let state: "normal" | "alarm" = "normal";
    const renderer = createSvgRenderer({
      symbols: createExampleSymbolRegistry(),
      runtimeState: { getNodeState: () => state }
    });
    renderer.mount(createContainer());
    renderer.renderDocument(createRendererTestDocument());
    renderer.resize({ width: 1000, height: 700 });
    expect(renderer.getSvgElement()?.getAttribute("viewBox")).toBe("0 0 1000 700");
    renderer.setZoom(2, { x: 0, y: 0 });
    renderer.panBy({ x: 20, y: 30 });
    expect(renderer.getViewport()).toEqual({ x: 20, y: 30, zoom: 2 });
    renderer.fitToView(0);
    expect(renderer.getViewport().zoom).toBe(1);
    renderer.setOptions({ showGrid: false, portVisibility: "never" });
    expect(renderer.getSvgElement()?.querySelector("[data-scada-grid]")?.childElementCount).toBe(0);
    expect(renderer.getElementForPort("node_a", "outlet")).toBeUndefined();
    state = "alarm";
    renderer.refreshRuntimeStates(["node_a"]);
    expect(renderer.getElementForNode("node_a")?.classList.contains("scada-state-alarm")).toBe(
      true
    );
    const node = renderer.getElementForNode("node_a");
    expect(node).toBeDefined();
    if (node === undefined) return;
    expect(resolveEntityMetadata(node)).toMatchObject({
      entityType: "node",
      nodeId: "node_a"
    });
  });

  it("namespaces definitions across renderer instances and coalesces frames", () => {
    const first = createSvgRenderer({ symbols: createExampleSymbolRegistry() });
    const second = createSvgRenderer({ symbols: createExampleSymbolRegistry() });
    first.mount(createContainer());
    second.mount(createContainer());
    const document = createRendererTestDocument();
    first.renderDocument(document);
    second.renderDocument(document);
    const firstPattern = first.getSvgElement()?.querySelector("pattern")?.id;
    const secondPattern = second.getSvgElement()?.querySelector("pattern")?.id;
    expect(firstPattern).not.toBe(secondPattern);

    let scheduled: FrameRequestCallback | undefined;
    const callback = vi.spyOn(window, "requestAnimationFrame").mockImplementation((handler) => {
      scheduled = handler;
      return 1;
    });
    first.scheduleRenderChanges(document, {
      ...createEmptyChangeSet(),
      updatedNodeIds: ["node_a"]
    });
    first.scheduleRenderChanges(document, {
      ...createEmptyChangeSet(),
      updatedNodeIds: ["node_b"]
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(scheduled).toBeDefined();
    scheduled?.(1);
    callback.mockRestore();
  });
});
