import {
  createSvgRenderer,
  resolveEntityMetadata,
  type RendererEvent
} from "@web-scada/renderer-svg";
import { createRuntimeEngine, type RuntimeEngineEvent } from "@web-scada/runtime-engine";
import { createExampleSymbolRegistry } from "@web-scada/symbols";

import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";
import { SimulatedProcessProvider } from "./simulated-provider.js";
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
const runtimeStatus = requiredElement("#runtime-status");
const tagStatus = requiredElement("#tag-status");
const diagnosticStatus = requiredElement("#diagnostic-status");
let showGrid = true;
let showPorts = true;
const provider = new SimulatedProcessProvider();
const runtime = createRuntimeEngine({
  document: WATER_TREATMENT_DOCUMENT,
  provider,
  reconnect: { initialDelayMs: 500, maximumDelayMs: 4000 }
});

function updateViewportStatus(event?: RendererEvent): void {
  if (event !== undefined && event.type !== "viewport-changed") return;
  const { x, y, zoom } = renderer.getViewport();
  viewportStatus.value = `x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(zoom * 100)}%`;
}

const renderer = createSvgRenderer({
  symbols: createExampleSymbolRegistry(),
  runtimeState: runtime.visualState,
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

function updateRuntimeStatus(event?: RuntimeEngineEvent): void {
  const snapshot = runtime.getSnapshot();
  runtimeStatus.textContent = snapshot.status.toUpperCase();
  runtimeStatus.dataset.status = snapshot.status;
  tagStatus.textContent = `${String(snapshot.valueCount)} / ${String(snapshot.subscribedTagIds.length)} tags · revision ${String(snapshot.runtimeRevision)}`;
  const lastDiagnostic = snapshot.diagnostics.at(-1);
  diagnosticStatus.textContent =
    lastDiagnostic === undefined
      ? "No diagnostics"
      : `${lastDiagnostic.code}: ${lastDiagnostic.message}`;
  if (event?.type === "values")
    renderer.refreshRuntimeStates(event.affected.nodeIds, event.affected.connectionIds);
}

const unsubscribeRuntime = runtime.subscribe(updateRuntimeStatus);
updateRuntimeStatus();
void runtime.start().catch(() => {
  updateRuntimeStatus();
});

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
  provider.setAlarm(!provider.alarm);
});
requiredButton("#connection-toggle").addEventListener("click", () => {
  provider.setAvailable(!provider.available);
  if (provider.available) void runtime.start();
  requiredButton("#connection-toggle").textContent = provider.available
    ? "Disconnect"
    : "Reconnect";
});
let uncertain = false;
requiredButton("#quality-toggle").addEventListener("click", () => {
  uncertain = !uncertain;
  provider.setQuality(uncertain ? "uncertain" : "good");
});
requiredButton("#pause-toggle").addEventListener("click", () => {
  provider.setPaused(!provider.paused);
  requiredButton("#pause-toggle").textContent = provider.paused ? "Resume" : "Pause";
});
requiredButton("#runtime-reset").addEventListener("click", () => {
  runtime.clear();
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
  unsubscribeRuntime();
  void runtime.dispose();
  renderer.dispose();
});
