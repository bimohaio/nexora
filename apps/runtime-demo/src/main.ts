import {
  createSvgRenderer,
  resolveEntityMetadata,
  type RendererEvent
} from "@web-scada/renderer-svg";
import { createExampleSymbolRegistry, type SymbolState } from "@web-scada/symbols";

import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";
import "./style.css";

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Required element not found: ${selector}`);
  return element;
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (element === null) throw new Error(`Required button not found: ${selector}`);
  return element;
}

const viewer = requiredElement("#viewer");
const viewportStatusElement = document.querySelector<HTMLOutputElement>("#viewport-status");
if (viewportStatusElement === null) throw new Error("Viewport status output not found.");
const viewportStatus: HTMLOutputElement = viewportStatusElement;
let pumpState: SymbolState = "running";
let showGrid = true;
let showPorts = true;
const runtimeStates = new Map<string, SymbolState>([
  ["node_pump", pumpState],
  ["node_indicator", "running"]
]);

function updateViewportStatus(event?: RendererEvent): void {
  if (event !== undefined && event.type !== "viewport-changed") return;
  const { x, y, zoom } = renderer.getViewport();
  viewportStatus.value = `x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(zoom * 100)}%`;
}

const renderer = createSvgRenderer({
  symbols: createExampleSymbolRegistry(),
  runtimeState: {
    getNodeState: (nodeId) => runtimeStates.get(nodeId)
  },
  onEvent: updateViewportStatus,
  options: {
    showGrid,
    showPorts,
    gridPattern: "dots",
    portVisibility: "always",
    ariaLabel: WATER_TREATMENT_DOCUMENT.metadata.name
  }
});

renderer.mount(viewer);
renderer.renderDocument(WATER_TREATMENT_DOCUMENT);
renderer.fitToView(40);
updateViewportStatus();

requiredButton("#grid-toggle").addEventListener("click", () => {
  showGrid = !showGrid;
  renderer.setOptions({ showGrid });
});
requiredButton("#ports-toggle").addEventListener("click", () => {
  showPorts = !showPorts;
  renderer.setOptions({ showPorts });
});
requiredButton("#zoom-in").addEventListener("click", () => {
  renderer.setZoom(renderer.getViewport().zoom * 1.25);
});
requiredButton("#zoom-out").addEventListener("click", () => {
  renderer.setZoom(renderer.getViewport().zoom / 1.25);
});
requiredButton("#reset").addEventListener("click", () => {
  renderer.resetViewport();
});
requiredButton("#fit").addEventListener("click", () => {
  renderer.fitToView(40);
});
requiredButton("#state-toggle").addEventListener("click", () => {
  pumpState = pumpState === "running" ? "alarm" : "running";
  runtimeStates.set("node_pump", pumpState);
  renderer.refreshRuntimeStates(["node_pump"]);
});

let pointerId: number | undefined;
let lastPoint: { readonly x: number; readonly y: number } | undefined;
viewer.addEventListener("pointerdown", (event) => {
  if (resolveEntityMetadata(event.target).entityType !== undefined) return;
  pointerId = event.pointerId;
  lastPoint = { x: event.clientX, y: event.clientY };
  viewer.setPointerCapture(pointerId);
});
viewer.addEventListener("pointermove", (event) => {
  if (event.pointerId !== pointerId || lastPoint === undefined) return;
  renderer.panBy({ x: event.clientX - lastPoint.x, y: event.clientY - lastPoint.y });
  lastPoint = { x: event.clientX, y: event.clientY };
});
const endPan = (event: PointerEvent): void => {
  if (event.pointerId !== pointerId) return;
  if (viewer.hasPointerCapture(event.pointerId)) viewer.releasePointerCapture(event.pointerId);
  pointerId = undefined;
  lastPoint = undefined;
};
viewer.addEventListener("pointerup", endPan);
viewer.addEventListener("pointercancel", endPan);

const observer = new ResizeObserver(([entry]) => {
  if (entry === undefined) return;
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) renderer.resize({ width, height });
});
observer.observe(viewer);
window.addEventListener("beforeunload", () => {
  observer.disconnect();
  renderer.dispose();
});
