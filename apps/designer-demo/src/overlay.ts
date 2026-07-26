import type { DesignerRuntimeState, ResizeHandle } from "@web-scada/designer-engine";
import { calculateViewportTransform } from "@web-scada/renderer-svg";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, name);
}

function handlePoint(
  handle: ResizeHandle,
  transform: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }
): { x: number; y: number } {
  const horizontal = handle.includes("w")
    ? transform.x
    : handle.includes("e")
      ? transform.x + transform.width
      : transform.x + transform.width / 2;
  const vertical = handle.includes("n")
    ? transform.y
    : handle.includes("s")
      ? transform.y + transform.height
      : transform.y + transform.height / 2;
  return { x: horizontal, y: vertical };
}

export class DesignerOverlay {
  public constructor(private readonly root: SVGSVGElement) {}

  public resize(width: number, height: number): void {
    this.root.setAttribute("viewBox", `0 0 ${String(width)} ${String(height)}`);
  }

  public render(state: DesignerRuntimeState): void {
    this.root.replaceChildren();
    const viewport = svg("g");
    viewport.setAttribute("transform", calculateViewportTransform(state.viewport));
    viewport.dataset.designerOverlayViewport = "";

    for (const nodeId of state.selection.selectedNodeIds) {
      const node = state.document.nodes.find(({ id }) => id === nodeId);
      if (node === undefined) continue;
      const { transform } = node;
      const previewDelta =
        state.interaction.type === "drag"
          ? {
              x: state.interaction.current.x - state.interaction.origin.x,
              y: state.interaction.current.y - state.interaction.origin.y
            }
          : { x: 0, y: 0 };
      const rectangle = svg("rect");
      rectangle.dataset.selectionNodeId = node.id;
      rectangle.setAttribute("x", String(transform.x + previewDelta.x));
      rectangle.setAttribute("y", String(transform.y + previewDelta.y));
      rectangle.setAttribute("width", String(transform.width));
      rectangle.setAttribute("height", String(transform.height));
      rectangle.setAttribute("class", "selection-outline");
      viewport.append(rectangle);
      if (state.selection.selectedNodeIds.length === 1) {
        for (const handle of HANDLES) {
          const point = handlePoint(handle, {
            ...transform,
            x: transform.x + previewDelta.x,
            y: transform.y + previewDelta.y
          });
          const circle = svg("circle");
          circle.dataset.resizeHandle = handle;
          circle.dataset.nodeId = node.id;
          circle.setAttribute("cx", String(point.x));
          circle.setAttribute("cy", String(point.y));
          circle.setAttribute("r", String(6 / state.viewport.zoom));
          circle.setAttribute("class", "resize-handle");
          viewport.append(circle);
        }
      }
    }

    if (state.hover.entityType === "node" && state.hover.nodeId !== undefined) {
      const node = state.document.nodes.find(({ id }) => id === state.hover.nodeId);
      if (node !== undefined && !state.selection.selectedNodeIds.includes(node.id)) {
        const hover = svg("rect");
        hover.setAttribute("x", String(node.transform.x));
        hover.setAttribute("y", String(node.transform.y));
        hover.setAttribute("width", String(node.transform.width));
        hover.setAttribute("height", String(node.transform.height));
        hover.setAttribute("class", "hover-outline");
        viewport.append(hover);
      }
    }

    if (state.interaction.type === "marquee") {
      const marquee = svg("rect");
      marquee.setAttribute(
        "x",
        String(Math.min(state.interaction.origin.x, state.interaction.current.x))
      );
      marquee.setAttribute(
        "y",
        String(Math.min(state.interaction.origin.y, state.interaction.current.y))
      );
      marquee.setAttribute(
        "width",
        String(Math.abs(state.interaction.current.x - state.interaction.origin.x))
      );
      marquee.setAttribute(
        "height",
        String(Math.abs(state.interaction.current.y - state.interaction.origin.y))
      );
      marquee.setAttribute("class", "marquee");
      viewport.append(marquee);
    }

    if (state.interaction.type === "connection") {
      const { sourceNodeId } = state.interaction;
      const source = state.document.nodes.find(({ id }) => id === sourceNodeId);
      if (source !== undefined) {
        const preview = svg("line");
        preview.setAttribute("x1", String(source.transform.x + source.transform.width / 2));
        preview.setAttribute("y1", String(source.transform.y + source.transform.height / 2));
        preview.setAttribute("x2", String(state.interaction.current.x));
        preview.setAttribute("y2", String(state.interaction.current.y));
        preview.setAttribute("class", "connection-preview");
        viewport.append(preview);
      }
    }

    for (const guide of state.guides) {
      const line = svg("line");
      if (guide.axis === "x") {
        line.setAttribute("x1", String(guide.position));
        line.setAttribute("x2", String(guide.position));
        line.setAttribute("y1", String(guide.from));
        line.setAttribute("y2", String(guide.to));
      } else {
        line.setAttribute("x1", String(guide.from));
        line.setAttribute("x2", String(guide.to));
        line.setAttribute("y1", String(guide.position));
        line.setAttribute("y2", String(guide.position));
      }
      line.setAttribute("class", "snap-guide");
      viewport.append(line);
    }
    this.root.append(viewport);
  }
}
