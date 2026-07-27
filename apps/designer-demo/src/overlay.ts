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
      const preview =
        state.interaction.type === "rotate"
          ? state.interaction.previewNodes.find(({ id }) => id === node.id)
          : undefined;
      const transform = preview?.transform ?? node.transform;
      const previewDelta =
        state.interaction.type === "drag"
          ? {
              x: state.interaction.current.x - state.interaction.origin.x,
              y: state.interaction.current.y - state.interaction.origin.y
            }
          : { x: 0, y: 0 };
      const displayTransform = {
        ...transform,
        x: transform.x + previewDelta.x,
        y: transform.y + previewDelta.y
      };
      const centerX = displayTransform.x + displayTransform.width / 2;
      const centerY = displayTransform.y + displayTransform.height / 2;
      const selection = svg("g");
      selection.setAttribute(
        "transform",
        `rotate(${String(displayTransform.rotation)} ${String(centerX)} ${String(centerY)})`
      );
      const rectangle = svg("rect");
      rectangle.dataset.selectionNodeId = node.id;
      rectangle.setAttribute("x", String(displayTransform.x));
      rectangle.setAttribute("y", String(displayTransform.y));
      rectangle.setAttribute("width", String(displayTransform.width));
      rectangle.setAttribute("height", String(displayTransform.height));
      rectangle.setAttribute("class", "selection-outline");
      selection.append(rectangle);
      if (state.selection.selectedNodeIds.length === 1) {
        for (const handle of HANDLES) {
          const point = handlePoint(handle, displayTransform);
          const circle = svg("circle");
          circle.dataset.resizeHandle = handle;
          circle.dataset.nodeId = node.id;
          circle.setAttribute("cx", String(point.x));
          circle.setAttribute("cy", String(point.y));
          circle.setAttribute("r", String(6 / state.viewport.zoom));
          circle.setAttribute("class", "resize-handle");
          selection.append(circle);
        }
        const handleY = displayTransform.y - 30 / state.viewport.zoom;
        const stem = svg("line");
        stem.setAttribute("x1", String(centerX));
        stem.setAttribute("x2", String(centerX));
        stem.setAttribute("y1", String(displayTransform.y));
        stem.setAttribute("y2", String(handleY));
        stem.setAttribute("class", "rotation-stem");
        const rotation = svg("circle");
        rotation.dataset.rotateHandle = "";
        rotation.dataset.nodeId = node.id;
        rotation.setAttribute("cx", String(centerX));
        rotation.setAttribute("cy", String(handleY));
        rotation.setAttribute("r", String(7 / state.viewport.zoom));
        rotation.setAttribute("class", "rotation-handle");
        selection.append(stem, rotation);
      }
      viewport.append(selection);
    }

    for (const connectionId of state.selection.selectedConnectionIds) {
      const connection = state.document.connections.find(({ id }) => id === connectionId);
      if (connection === undefined) continue;
      connection.waypoints.forEach((waypoint, index) => {
        const preview =
          state.interaction.type === "waypoint" &&
          state.interaction.connectionId === connection.id &&
          state.interaction.waypointIndex === index
            ? state.interaction.current
            : waypoint;
        const handle = svg("circle");
        handle.dataset.connectionId = connection.id;
        handle.dataset.waypointIndex = String(index);
        handle.setAttribute("cx", String(preview.x));
        handle.setAttribute("cy", String(preview.y));
        handle.setAttribute("r", String(6 / state.viewport.zoom));
        handle.setAttribute("class", "waypoint-handle");
        viewport.append(handle);
      });
    }

    if (state.hover.entityType === "node" && state.hover.nodeId !== undefined) {
      const node = state.document.nodes.find(({ id }) => id === state.hover.nodeId);
      if (node !== undefined && !state.selection.selectedNodeIds.includes(node.id)) {
        const hover = svg("rect");
        hover.setAttribute("x", String(node.transform.x));
        hover.setAttribute("y", String(node.transform.y));
        hover.setAttribute("width", String(node.transform.width));
        hover.setAttribute("height", String(node.transform.height));
        hover.setAttribute(
          "transform",
          `rotate(${String(node.transform.rotation)} ${String(node.transform.x + node.transform.width / 2)} ${String(node.transform.y + node.transform.height / 2)})`
        );
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
