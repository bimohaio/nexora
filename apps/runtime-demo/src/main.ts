import { parseDocument, parseDocumentJson, serializeDocumentJson } from "@web-scada/core";
import { createDesignerEngine, type DesignerController } from "@web-scada/designer-engine";
import {
  createIndustrialSymbolEnvironment,
  createSvgRenderer,
  resolveEntityMetadata,
  validateDocumentSymbolEnvironment,
  type RendererEvent
} from "@web-scada/renderer-svg";
import {
  createRuntimeEngine,
  createRuntimeRenderPipeline,
  type RuntimeEngineEvent
} from "@web-scada/runtime-engine";
import {
  PUBLISHED_DOCUMENT_STORAGE_KEY,
  PUBLISHED_REVISION_STORAGE_KEY,
  createDesignerHandoffUrl,
  isPublishDocumentMessage,
  resolveDesignerUrl
} from "./designer-handoff.js";
import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";
import { ManagedSimulatorProvider } from "./simulated-provider.js";

// The generic maps a known selector to its expected DOM subtype.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Required element not found: ${selector}`);
  return element;
}

const viewer = required<HTMLElement>("#viewer");
const viewportStatus = required<HTMLOutputElement>("#viewport-status");
const runtimeStatus = required<HTMLOutputElement>("#runtime-status");
const tagStatus = required<HTMLOutputElement>("#tag-status");
const diagnosticStatus = required<HTMLOutputElement>("#diagnostic-status");
const documentStatus = required<HTMLOutputElement>("#document-status");
const modeStatus = required<HTMLOutputElement>("#mode-status");
const diagnosticsElement = required<HTMLElement>("#datasource-diagnostics");
const valuesElement = required<HTMLTableSectionElement>("#runtime-values");
const valueCount = required<HTMLOutputElement>("#value-count");
const entityInspector = required<HTMLElement>("#entity-inspector");
const errorRegion = required<HTMLElement>("#error-region");
const datasourceSelect = required<HTMLSelectElement>("#datasource-select");
const adapterConfig = required<HTMLElement>("#adapter-config");
const openDesigner = required<HTMLButtonElement>("#open-designer");

const symbolEnvironment = createIndustrialSymbolEnvironment();
const { symbolRegistry: symbols, svgVisualRegistry: symbolVisuals } = symbolEnvironment;
const storedDocumentJson = window.sessionStorage.getItem(PUBLISHED_DOCUMENT_STORAGE_KEY);
const parsed =
  storedDocumentJson === null
    ? parseDocument(WATER_TREATMENT_DOCUMENT, { symbolRegistry: symbols })
    : parseDocumentJson(storedDocumentJson, { symbolRegistry: symbols });
if (!parsed.success) throw new Error(parsed.issues.map(({ message }) => message).join("; "));
const documentModel = parsed.document;
const serializedDesign = serializeDocumentJson(documentModel);
if (!serializedDesign.success) throw new Error(serializedDesign.error);
const serializedDesignJson = serializedDesign.json;
const configuredDesignerUrl = document
  .querySelector<HTMLMetaElement>('meta[name="nexora-designer-url"]')
  ?.content.trim();
const designerUrl = resolveDesignerUrl(
  new URL(window.location.href),
  configuredDesignerUrl === "" ? undefined : configuredDesignerUrl
);
const storedRevision = Number(window.sessionStorage.getItem(PUBLISHED_REVISION_STORAGE_KEY) ?? "1");
const publishedRevision =
  Number.isInteger(storedRevision) && storedRevision >= 1 ? storedRevision : 1;
documentStatus.value = `Validated · revision ${String(publishedRevision)} · schema ${documentModel.schemaVersion} · ${String(documentModel.nodes.length)} nodes`;

const provider = new ManagedSimulatorProvider();
const symbolValidation = validateDocumentSymbolEnvironment(documentModel, symbolEnvironment);
if (!symbolValidation.valid)
  throw new Error(
    symbolValidation.diagnostics
      .map(({ code, nodeId, symbolType }) => `${code}:${nodeId}:${symbolType}`)
      .join("; ")
  );
const runtime = createRuntimeEngine({
  document: documentModel,
  provider,
  symbols,
  reconnect: { initialDelayMs: 500, maximumDelayMs: 4_000 }
});

let showGrid = true;
let showPorts = true;
let subscribed = true;
let selectedId: string | undefined;
let editingWindow: Window | null = null;
let editingSessionId: string | undefined;

function updateViewportStatus(event?: RendererEvent): void {
  if (event !== undefined && event.type !== "viewport-changed") return;
  const { x, y, zoom } = renderer.getViewport();
  viewportStatus.value = `x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(zoom * 100)}%`;
}

const renderer = createSvgRenderer({
  symbols,
  symbolRenderers: symbolVisuals,
  runtimeState: runtime.visualState,
  onEvent: updateViewportStatus,
  options: {
    showGrid,
    showPorts,
    gridPattern: "dots",
    portVisibility: "always",
    ariaLabel: documentModel.metadata.name
  }
});
renderer.mount(viewer);
renderer.renderDocument(documentModel);
renderer.fitToView(40);
updateViewportStatus();
const designer: DesignerController = createDesignerEngine({
  document: documentModel,
  symbols,
  renderer
});
const runtimeRenderPipeline = createRuntimeRenderPipeline({ source: runtime, renderer });

function updateRuntimeStatus(_event?: RuntimeEngineEvent): void {
  const snapshot = runtime.getSnapshot();
  runtimeStatus.textContent = snapshot.status.toUpperCase();
  runtimeStatus.dataset.status = snapshot.status;
  tagStatus.textContent = `${String(snapshot.valueCount)} / ${String(snapshot.subscribedTagIds.length)} tags · revision ${String(snapshot.runtimeRevision)}`;
  const lastDiagnostic = snapshot.diagnostics.at(-1);
  diagnosticStatus.textContent =
    lastDiagnostic === undefined
      ? "No diagnostics"
      : `${lastDiagnostic.code}: ${lastDiagnostic.message}`;
}

function updateDatasourcePanels(): void {
  const snapshot = provider.getDiagnostics();
  const source = snapshot.sources[0];
  const fields: readonly [string, string][] =
    source === undefined
      ? [
          ["Manager", snapshot.manager.state],
          ["Source", "Not registered"]
        ]
      : [
          ["Source", source.descriptor.id],
          ["Adapter", source.descriptor.adapterType],
          ["Manager", snapshot.manager.state],
          ["Connection", source.connectionStatus.state],
          ["Health", source.health.state],
          ["Subscriptions", String(source.activeSubscriptions)],
          ["Events", String(source.counters.eventsReceived)],
          ["Errors", String(source.counters.errors)],
          ["Generation", String(source.generation)],
          [
            "Last event",
            source.lastDataAt === undefined
              ? "Not available"
              : new Date(source.lastDataAt).toLocaleTimeString()
          ]
        ];
  diagnosticsElement.replaceChildren(
    ...fields.flatMap(([term, description]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      return [dt, dd];
    })
  );
  const values = provider.getRecentValues();
  valueCount.value = `${String(values.length)} values · event ${String(provider.eventRevision)}`;
  valuesElement.replaceChildren(
    ...values.map((value) => {
      const row = document.createElement("tr");
      const cells = [
        value.tagId,
        typeof value.value === "string" ? value.value : JSON.stringify(value.value),
        value.quality.toUpperCase(),
        new Date(value.timestamp).toLocaleTimeString()
      ];
      for (const text of cells) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      row.dataset.quality = value.quality;
      return row;
    })
  );
}

async function startRuntime(): Promise<void> {
  try {
    subscribed = true;
    await runtime.start();
    required<HTMLButtonElement>("#subscribe-toggle").textContent = "Unsubscribe";
    updateRuntimeStatus();
  } catch (error) {
    showError(error);
  }
}

async function stopRuntime(): Promise<void> {
  try {
    subscribed = false;
    await runtime.stop();
    required<HTMLButtonElement>("#subscribe-toggle").textContent = "Subscribe";
    updateRuntimeStatus();
    const current = serializeDocumentJson(designer.getState().document);
    if (!current.success || current.json !== serializedDesignJson)
      showError(new Error("Runtime changed persisted design data."));
  } catch (error) {
    showError(error);
  }
}

function inspectSelection(): void {
  const node = documentModel.nodes.find(({ id }) => id === selectedId);
  const connection = documentModel.connections.find(({ id }) => id === selectedId);
  const entity = node ?? connection;
  if (entity === undefined) {
    entityInspector.textContent = "Select a node or connection.";
    entityInspector.className = "empty-state";
    return;
  }
  entityInspector.className = "";
  entityInspector.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = entity.name;
  const details = document.createElement("p");
  details.textContent =
    node === undefined
      ? `Connection · ${connection?.medium ?? "unknown"}`
      : `${node.symbolType} · layer ${node.layerId}`;
  entityInspector.append(title, details);
}

function showAdapterConfiguration(): void {
  const adapter = datasourceSelect.value;
  const descriptions: Readonly<Record<string, string>> = {
    simulator:
      "Runs locally using the real deterministic Simulator adapter and Data Source Manager.",
    rest: "HTTPS endpoint, polling interval, method, mapping, and timeout. Configuration preview only.",
    websocket:
      "Secure WebSocket URL, subprotocol, heartbeat, and reconnect policy. Configuration preview only.",
    mqtt: "Requires a browser-capable MQTT-over-WebSocket client or gateway. No credentials are stored.",
    modbus:
      "Raw Modbus TCP is unavailable in browsers. Use a secured backend or WebSocket gateway.",
    opcua: "Native OPC UA transport requires Node.js/backend connectivity. Use a secured gateway."
  };
  adapterConfig.textContent = descriptions[adapter] ?? "Unsupported adapter.";
  const simulator = adapter === "simulator";
  for (const id of [
    "#connection-toggle",
    "#subscribe-toggle",
    "#pause-toggle",
    "#runtime-reset",
    "#quality-toggle",
    "#state-toggle"
  ])
    required<HTMLButtonElement>(id).disabled = !simulator;
}

function showError(error: unknown): void {
  errorRegion.textContent = error instanceof Error ? error.message : String(error);
}

const unsubscribeRuntime = runtime.subscribe(updateRuntimeStatus);
const unobserveProvider = provider.observe(updateDatasourcePanels);
updateRuntimeStatus();
updateDatasourcePanels();
showAdapterConfiguration();
void startRuntime();

openDesigner.addEventListener("click", () => {
  const sessionId = crypto.randomUUID();
  const handoffUrl = createDesignerHandoffUrl(designerUrl, serializedDesignJson, {
    sessionId,
    runtimeOrigin: window.location.origin,
    baseRevision: publishedRevision
  });
  const popup = window.open(handoffUrl, "_blank");
  if (popup === null) {
    showError(new Error("Designer could not be opened. Allow pop-ups and try again."));
    return;
  }
  editingWindow = popup;
  editingSessionId = sessionId;
  openDesigner.disabled = true;
  modeStatus.value = `Stopping Runtime for editing · revision ${String(publishedRevision)}`;
  void stopRuntime()
    .then(() => {
      modeStatus.value = `Stopped for editing · revision ${String(publishedRevision)}`;
    })
    .catch((error: unknown) => {
      popup.close();
      editingWindow = null;
      editingSessionId = undefined;
      openDesigner.disabled = false;
      showError(error);
    });
});

function receiveDesignerPublish(event: MessageEvent<unknown>): void {
  if (
    event.origin !== designerUrl.origin ||
    event.source !== editingWindow ||
    !isPublishDocumentMessage(event.data) ||
    event.data.sessionId !== editingSessionId
  )
    return;
  const message = event.data;
  if (message.documentId !== documentModel.id || message.baseRevision !== publishedRevision) {
    editingWindow?.postMessage(
      {
        type: "nexora:publish-rejected",
        sessionId: message.sessionId,
        reason: "The Runtime document revision changed. Reopen Designer from Runtime."
      },
      designerUrl.origin
    );
    return;
  }
  const candidate = parseDocumentJson(message.documentJson, { symbolRegistry: symbols });
  if (!candidate.success) {
    editingWindow?.postMessage(
      {
        type: "nexora:publish-rejected",
        sessionId: message.sessionId,
        reason: candidate.issues.map(({ message: issue }) => issue).join("; ")
      },
      designerUrl.origin
    );
    return;
  }
  const validation = validateDocumentSymbolEnvironment(candidate.document, symbolEnvironment);
  if (!validation.valid) {
    editingWindow?.postMessage(
      {
        type: "nexora:publish-rejected",
        sessionId: message.sessionId,
        reason: validation.diagnostics.map(({ code }) => code).join("; ")
      },
      designerUrl.origin
    );
    return;
  }
  const nextRevision = publishedRevision + 1;
  window.sessionStorage.setItem(PUBLISHED_DOCUMENT_STORAGE_KEY, message.documentJson);
  window.sessionStorage.setItem(PUBLISHED_REVISION_STORAGE_KEY, String(nextRevision));
  editingWindow?.postMessage(
    {
      type: "nexora:publish-accepted",
      sessionId: message.sessionId,
      revision: nextRevision
    },
    designerUrl.origin
  );
  modeStatus.value = `Reloading published revision ${String(nextRevision)}`;
  window.setTimeout(() => window.location.reload(), 0);
}
window.addEventListener("message", receiveDesignerPublish);

required<HTMLButtonElement>("#runtime-start").addEventListener("click", () => {
  editingWindow = null;
  editingSessionId = undefined;
  openDesigner.disabled = false;
  modeStatus.value = `Runtime viewer · revision ${String(publishedRevision)}`;
  void startRuntime();
});
required<HTMLButtonElement>("#runtime-stop").addEventListener("click", () => {
  void stopRuntime();
});
required<HTMLButtonElement>("#grid-toggle").addEventListener("click", () => {
  showGrid = !showGrid;
  renderer.setOptions({ showGrid });
});
required<HTMLButtonElement>("#ports-toggle").addEventListener("click", () => {
  showPorts = !showPorts;
  renderer.setOptions({ showPorts });
});
required<HTMLButtonElement>("#zoom-in").addEventListener("click", () => {
  renderer.setZoom(renderer.getViewport().zoom * 1.25);
});
required<HTMLButtonElement>("#zoom-out").addEventListener("click", () => {
  renderer.setZoom(renderer.getViewport().zoom / 1.25);
});
required<HTMLButtonElement>("#reset").addEventListener("click", () => {
  renderer.resetViewport();
});
required<HTMLButtonElement>("#fit").addEventListener("click", () => {
  renderer.fitToView(40);
});
required<HTMLButtonElement>("#state-toggle").addEventListener("click", () => {
  void provider.setAlarm(!provider.alarm);
});
let pumpDisabled = false;
required<HTMLButtonElement>("#override-toggle").addEventListener("click", () => {
  pumpDisabled = !pumpDisabled;
  if (pumpDisabled)
    runtime.setVisualOverride("node_feed_pump", {
      disabled: true,
      enabled: false,
      state: "disabled"
    });
  else runtime.clearVisualOverride("node_feed_pump");
  required<HTMLButtonElement>("#override-toggle").textContent = pumpDisabled
    ? "Enable pump"
    : "Disable pump";
});
required<HTMLButtonElement>("#connection-toggle").addEventListener("click", () => {
  void (async () => {
    if (provider.available) {
      await provider.setAvailable(false);
      required<HTMLButtonElement>("#connection-toggle").textContent = "Reconnect";
    } else {
      await provider.reconnect();
      required<HTMLButtonElement>("#connection-toggle").textContent = "Disconnect";
      await runtime.start();
    }
  })().catch(showError);
});
required<HTMLButtonElement>("#quality-toggle").addEventListener("click", () => {
  const bad = provider.quality === "good";
  provider.setQuality(bad ? "bad" : "good");
  required<HTMLButtonElement>("#quality-toggle").textContent = bad
    ? "Restore good quality"
    : "Bad quality";
});
required<HTMLButtonElement>("#pause-toggle").addEventListener("click", () => {
  provider.setPaused(!provider.paused);
  required<HTMLButtonElement>("#pause-toggle").textContent = provider.paused ? "Resume" : "Pause";
});
required<HTMLButtonElement>("#runtime-reset").addEventListener("click", () => {
  provider.reset();
  runtime.clear();
});
required<HTMLButtonElement>("#subscribe-toggle").addEventListener("click", () => {
  if (subscribed) void stopRuntime();
  else void startRuntime();
});
datasourceSelect.addEventListener("change", showAdapterConfiguration);
required<HTMLButtonElement>("#undo").addEventListener("click", () => {
  designer.undo();
});
required<HTMLButtonElement>("#redo").addEventListener("click", () => {
  designer.redo();
});

let pointerId: number | undefined;
let lastPoint: { readonly x: number; readonly y: number } | undefined;
viewer.addEventListener("pointerdown", (event) => {
  const metadata = resolveEntityMetadata(event.target);
  if (metadata.entityId !== undefined) {
    selectedId = metadata.nodeId ?? metadata.entityId;
    if (metadata.entityType === "node" && metadata.nodeId !== undefined)
      designer.selectNode(metadata.nodeId);
    else if (metadata.entityType === "connection") designer.selectConnection(metadata.entityId);
    inspectSelection();
    return;
  }
  if (metadata.entityType !== undefined) return;
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

async function dispose(): Promise<void> {
  window.removeEventListener("message", receiveDesignerPublish);
  observer.disconnect();
  unobserveProvider();
  unsubscribeRuntime();
  runtimeRenderPipeline.dispose();
  designer.dispose();
  await runtime.dispose();
  await provider.dispose();
  renderer.dispose();
}
window.addEventListener("beforeunload", () => {
  void dispose();
});
