import { UlidEntityIdGenerator, type ScadaNode } from "@web-scada/core";
import {
  ConnectionTool,
  DesignerToolController,
  InMemoryToolRegistry,
  PanTool,
  RectangleTool,
  SelectTool,
  createDesignerAccessibilityEngine,
  createDesignerEngine,
  designerAccessibilityNodes,
  handleDesignerShortcut,
  isDesignerShortcutTarget,
  type DesignerController,
  type DesignerPointerEvent,
  type DesignerToolId,
  type ResizeHandle
} from "@web-scada/designer-engine";
import {
  angleFromCenter,
  getRectangleCenter,
  rotateTransforms,
  snapAngle
} from "@web-scada/geometry";
import {
  SvgAccessibilityAdapter,
  SvgLiveRegionAdapter,
  createSvgRenderer,
  resolveEntityMetadata,
  zoomViewportAtPoint
} from "@web-scada/renderer-svg";
import { createIndustrialSymbolRegistry, type SymbolDefinition } from "@web-scada/symbols";

import { DESIGNER_SAMPLE_DOCUMENT } from "./sample-document.js";
import { DesignerOverlay } from "./overlay.js";
import "./style.css";

// The generic maps a known selector to its expected DOM subtype.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function required<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (result === null) throw new Error(`Required element not found: ${selector}`);
  return result;
}

const canvas = required<HTMLElement>("#designer-canvas");
const rendererHost = required<HTMLElement>("#renderer-host");
const overlayElement = required<SVGSVGElement>("#designer-overlay");
const palette = required<HTMLElement>("#symbol-palette");
const search = required<HTMLInputElement>("#symbol-search");
const status = required<HTMLOutputElement>("#status");
const viewportStatus = required<HTMLOutputElement>("#viewport-status");
const inspector = required<HTMLFormElement>("#node-inspector");
const emptyInspector = required<HTMLElement>("#empty-inspector");
const undoButton = required<HTMLButtonElement>("#undo");
const redoButton = required<HTMLButtonElement>("#redo");
const symbols = createIndustrialSymbolRegistry();
const ids = new UlidEntityIdGenerator();
const overlay = new DesignerOverlay(overlayElement);

const renderer = createSvgRenderer({
  symbols,
  options: {
    showGrid: true,
    showPorts: true,
    portVisibility: "hover",
    ariaLabel: "Interactive SCADA process designer"
  },
  onEvent: (event) => {
    if (event.type === "entity-pointer-enter")
      designer.setHover({
        entityType:
          event.metadata.entityType === "node" ||
          event.metadata.entityType === "connection" ||
          event.metadata.entityType === "port"
            ? event.metadata.entityType
            : undefined,
        entityId: event.metadata.entityId,
        nodeId: event.metadata.nodeId,
        portId: event.metadata.portId
      });
    else if (event.type === "entity-pointer-leave") designer.setHover({});
  }
});
renderer.mount(rendererHost);
const designer: DesignerController = createDesignerEngine({
  document: DESIGNER_SAMPLE_DOCUMENT,
  symbols,
  renderer,
  idGenerator: ids
});
const contrastPreference = window.matchMedia("(forced-colors: active)");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const accessibility = createDesignerAccessibilityEngine({
  designer,
  renderer: new SvgAccessibilityAdapter(renderer),
  screenReader: new SvgLiveRegionAdapter(rendererHost),
  preferences: {
    highContrast: contrastPreference.matches,
    prefersReducedMotion: motionPreference.matches
  }
});
const updateAccessibilityPreferences = (): void => {
  accessibility.setPreferences({
    highContrast: contrastPreference.matches,
    prefersReducedMotion: motionPreference.matches
  });
};
contrastPreference.addEventListener("change", updateAccessibilityPreferences);
motionPreference.addEventListener("change", updateAccessibilityPreferences);
let accessibilitySelection = "";

const tools = new InMemoryToolRegistry();
tools.register(new SelectTool(designer));
tools.register(new PanTool(designer));
tools.register(new RectangleTool(designer, { symbols, ids }));
tools.register(new ConnectionTool(designer, { ids }));
const toolController = new DesignerToolController(designer, tools);
toolController.activate("select");

function localScreenPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function pointerEvent(event: PointerEvent): DesignerPointerEvent {
  const metadata = resolveEntityMetadata(event.target);
  const resizeHandle =
    event.target instanceof SVGElement ? event.target.dataset.resizeHandle : undefined;
  const screen = localScreenPoint(event);
  const point =
    designer.getRuntimeState().activeTool === "pan" ? screen : designer.toCanvasPoint(screen);
  return {
    point,
    button: event.button,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    entityType: resizeHandle === undefined ? metadata.entityType : "handle",
    entityId: metadata.entityId,
    nodeId:
      resizeHandle === undefined
        ? metadata.nodeId
        : event.target instanceof SVGElement
          ? event.target.dataset.nodeId
          : undefined,
    portId: metadata.portId
  };
}

let pointerId: number | undefined;
let resize:
  | {
      readonly nodeId: string;
      readonly handle: ResizeHandle;
      readonly origin: { readonly x: number; readonly y: number };
    }
  | undefined;
let rotation:
  | {
      readonly center: { readonly x: number; readonly y: number };
      readonly startAngle: number;
      readonly nodes: readonly ScadaNode[];
    }
  | undefined;
let waypoint:
  | {
      readonly connectionId: string;
      readonly index: number;
      readonly origin: { readonly x: number; readonly y: number };
    }
  | undefined;

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  const target = event.target;
  if (
    target instanceof SVGElement &&
    target.dataset.connectionId !== undefined &&
    target.dataset.waypointIndex !== undefined
  ) {
    const index = Number(target.dataset.waypointIndex);
    if (Number.isInteger(index))
      waypoint = {
        connectionId: target.dataset.connectionId,
        index,
        origin: designer.toCanvasPoint(localScreenPoint(event))
      };
  } else if (target instanceof SVGElement && target.dataset.rotateHandle !== undefined) {
    const nodes = designer
      .getState()
      .document.nodes.filter(({ id }) =>
        designer.getState().selection.selectedNodeIds.includes(id)
      );
    const selected = nodes[0];
    if (selected !== undefined) {
      const center = getRectangleCenter(selected.transform);
      rotation = {
        center,
        startAngle: angleFromCenter(center, designer.toCanvasPoint(localScreenPoint(event))),
        nodes
      };
    }
  } else if (target instanceof SVGElement && target.dataset.resizeHandle !== undefined) {
    const nodeId = target.dataset.nodeId;
    if (nodeId !== undefined) {
      resize = {
        nodeId,
        handle: target.dataset.resizeHandle as ResizeHandle,
        origin: designer.toCanvasPoint(localScreenPoint(event))
      };
    }
  } else toolController.pointerDown(pointerEvent(event));
  pointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== pointerId) return;
  const point = designer.toCanvasPoint(localScreenPoint(event));
  if (waypoint !== undefined) {
    designer.setInteraction({
      type: "waypoint",
      connectionId: waypoint.connectionId,
      waypointIndex: waypoint.index,
      origin: waypoint.origin,
      current: point
    });
  } else if (rotation !== undefined) {
    const rawDelta = angleFromCenter(rotation.center, point) - rotation.startAngle;
    const angle = snapAngle(rawDelta).angle;
    const transforms = rotateTransforms(
      rotation.nodes.map(({ transform }) => transform),
      angle,
      rotation.center
    );
    designer.setInteraction({
      type: "rotate",
      origin: rotation.center,
      current: point,
      nodeIds: rotation.nodes.map(({ id }) => id),
      previewNodes: rotation.nodes.map((node, index) => ({
        ...node,
        transform: transforms[index] ?? node.transform
      })),
      angle
    });
  } else if (resize !== undefined) {
    const node = designer.getState().document.nodes.find(({ id }) => id === resize?.nodeId);
    if (node !== undefined)
      designer.setInteraction({
        type: "resize",
        nodeId: node.id,
        handle: resize.handle,
        origin: resize.origin,
        originalNode: node
      });
  } else toolController.pointerMove(pointerEvent(event));
  status.value = `x ${String(Math.round(point.x))} · y ${String(Math.round(point.y))}`;
});

function finishPointer(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  if (waypoint !== undefined) {
    designer.moveWaypoint(
      waypoint.connectionId,
      waypoint.index,
      designer.toCanvasPoint(localScreenPoint(event))
    );
    waypoint = undefined;
    designer.setInteraction({ type: "idle" });
  } else if (rotation !== undefined) {
    const point = designer.toCanvasPoint(localScreenPoint(event));
    const angle = snapAngle(angleFromCenter(rotation.center, point) - rotation.startAngle).angle;
    designer.rotateSelection(angle);
    rotation = undefined;
    designer.setInteraction({ type: "idle" });
  } else if (resize !== undefined) {
    const point = designer.toCanvasPoint(localScreenPoint(event));
    designer.resizeNode(resize.nodeId, resize.handle, {
      x: point.x - resize.origin.x,
      y: point.y - resize.origin.y
    });
    resize = undefined;
    designer.setInteraction({ type: "idle" });
  } else toolController.pointerUp(pointerEvent(event));
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  pointerId = undefined;
}

canvas.addEventListener("pointerup", finishPointer);
function cancelPointer(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  resize = undefined;
  rotation = undefined;
  waypoint = undefined;
  toolController.cancel();
  designer.setInteraction({ type: "idle" });
  designer.setGuides([]);
  pointerId = undefined;
}
canvas.addEventListener("pointercancel", cancelPointer);
canvas.addEventListener("lostpointercapture", cancelPointer);
canvas.addEventListener(
  "wheel",
  (event) => {
    const viewport = designer.getState().viewport;
    designer.setViewport(
      zoomViewportAtPoint(
        viewport,
        viewport.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
        localScreenPoint(event)
      )
    );
    event.preventDefault();
  },
  { passive: false }
);

function activateTool(id: DesignerToolId): void {
  toolController.activate(id);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]"))
    button.setAttribute("aria-pressed", String(button.dataset.tool === id));
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]"))
  button.addEventListener("click", () => {
    activateTool(button.dataset.tool ?? "select");
  });

document.addEventListener("keydown", (event) => {
  const focus =
    event.target instanceof HTMLElement
      ? {
          tagName: event.target.tagName,
          contentEditable: event.target.isContentEditable,
          shortcutGuard: event.target.closest("[data-shortcut-guard]") !== null
        }
      : undefined;
  if (isDesignerShortcutTarget(focus)) return;
  const key = event.key.toLowerCase();
  if (!event.ctrlKey && !event.metaKey && key === "v") activateTool("select");
  else if (!event.ctrlKey && !event.metaKey && key === "h") activateTool("pan");
  else if (!event.ctrlKey && !event.metaKey && key === "r") activateTool("rectangle");
  else if (!event.ctrlKey && !event.metaKey && key === "c") activateTool("connection");
  else {
    const action = handleDesignerShortcut(designer, {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });
    if (action !== undefined) event.preventDefault();
  }
});

function displayName(definition: SymbolDefinition): string {
  return definition.type.slice(definition.type.indexOf(".") + 1).replaceAll("-", " ");
}

function renderPalette(query = ""): void {
  palette.replaceChildren();
  const normalized = query.trim().toLowerCase();
  for (const definition of symbols
    .getAll()
    .filter(({ type }) => normalized === "" || type.includes(normalized))
    .slice(0, 30)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.paletteSymbol = definition.type;
    button.textContent = displayName(definition);
    button.title = definition.type;
    button.addEventListener("click", () => {
      const layerId = designer.getState().document.layers[0]?.id;
      if (layerId === undefined) return;
      const index = designer.getState().document.nodes.length;
      designer.insertNode({
        id: ids.createNodeId(),
        name: displayName(definition),
        symbolType: definition.type,
        transform: {
          x: 180 + (index % 5) * 40,
          y: 140 + (index % 4) * 40,
          width: definition.defaultWidth,
          height: definition.defaultHeight,
          rotation: 0,
          scaleX: 1,
          scaleY: 1
        },
        properties: {},
        bindings: [],
        layerId,
        visible: true,
        locked: false
      });
    });
    palette.append(button);
  }
}

search.addEventListener("input", () => {
  renderPalette(search.value);
});
renderPalette();

function field(name: string): HTMLInputElement {
  const result = inspector.elements.namedItem(name);
  if (!(result instanceof HTMLInputElement)) throw new Error(`Inspector field missing: ${name}`);
  return result;
}

function renderInspector(): void {
  const state = designer.getRuntimeState();
  const node =
    state.selection.selectedNodeIds.length === 1
      ? state.document.nodes.find(({ id }) => id === state.selection.selectedNodeIds[0])
      : undefined;
  inspector.hidden = node === undefined;
  emptyInspector.hidden = node !== undefined;
  if (node === undefined) return;
  field("name").value = node.name;
  field("x").value = String(node.transform.x);
  field("y").value = String(node.transform.y);
  field("width").value = String(node.transform.width);
  field("height").value = String(node.transform.height);
  field("rotation").value = String(node.transform.rotation);
  field("fill").value =
    typeof node.properties.fill === "string" && /^#[0-9a-fA-F]{6}$/.test(node.properties.fill)
      ? node.properties.fill
      : "#475569";
}

inspector.addEventListener("change", () => {
  const nodeId = designer.getState().selection.selectedNodeIds[0];
  if (nodeId === undefined) return;
  designer.updateNode(nodeId, (node): ScadaNode => ({
    ...node,
    name: field("name").value,
    transform: {
      ...node.transform,
      x: field("x").valueAsNumber,
      y: field("y").valueAsNumber,
      width: field("width").valueAsNumber,
      height: field("height").valueAsNumber,
      rotation: field("rotation").valueAsNumber
    },
    properties: { ...node.properties, fill: field("fill").value }
  }));
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-order]"))
  button.addEventListener("click", () => {
    const operation = button.dataset.order;
    if (
      operation === "front" ||
      operation === "forward" ||
      operation === "backward" ||
      operation === "back"
    )
      designer.reorderSelection(operation);
  });

undoButton.addEventListener("click", () => {
  designer.undo();
});
redoButton.addEventListener("click", () => {
  designer.redo();
});
required<HTMLButtonElement>("#fit").addEventListener("click", () => {
  renderer.fitToView(40);
  designer.setViewport(renderer.getViewport());
});
required<HTMLButtonElement>("#center-selection").addEventListener("click", () => {
  designer.centerSelection({ width: canvas.clientWidth, height: canvas.clientHeight });
});

required<HTMLButtonElement>("#rotate-left").addEventListener("click", () => {
  designer.rotateSelection(-15);
});
required<HTMLButtonElement>("#rotate-right").addEventListener("click", () => {
  designer.rotateSelection(15);
});
required<HTMLButtonElement>("#group").addEventListener("click", () => {
  designer.groupSelection();
});
required<HTMLButtonElement>("#ungroup").addEventListener("click", () => {
  designer.ungroupSelection();
});
required<HTMLButtonElement>("#lock").addEventListener("click", () => {
  designer.setSelectionLocked(true);
});
required<HTMLButtonElement>("#unlock").addEventListener("click", () => {
  designer.setSelectionLocked(false);
});
required<HTMLButtonElement>("#hide").addEventListener("click", () => {
  designer.setSelectionVisible(false);
});
required<HTMLButtonElement>("#distribute-horizontal").addEventListener("click", () => {
  designer.distributeSelection("horizontal");
});
required<HTMLButtonElement>("#distribute-vertical").addEventListener("click", () => {
  designer.distributeSelection("vertical");
});
required<HTMLSelectElement>("#align").addEventListener("change", (event) => {
  const alignment = (event.currentTarget as HTMLSelectElement).value;
  if (
    alignment === "left" ||
    alignment === "horizontal-center" ||
    alignment === "right" ||
    alignment === "top" ||
    alignment === "vertical-center" ||
    alignment === "bottom"
  )
    designer.alignSelection(alignment);
});
const layerTarget = required<HTMLSelectElement>("#layer-target");
for (const layer of designer.getState().document.layers) {
  const option = document.createElement("option");
  option.value = layer.id;
  option.textContent = layer.name;
  layerTarget.append(option);
}
layerTarget.addEventListener("change", () => {
  designer.reassignSelectionToLayer(layerTarget.value);
});
required<HTMLButtonElement>("#add-waypoint").addEventListener("click", () => {
  const state = designer.getState();
  const connection = state.document.connections.find(({ id }) =>
    state.selection.selectedConnectionIds.includes(id)
  );
  if (connection === undefined) return;
  const source = state.document.nodes.find(({ id }) => id === connection.source.nodeId);
  const target = state.document.nodes.find(({ id }) => id === connection.target.nodeId);
  if (source === undefined || target === undefined) return;
  designer.insertWaypoint(connection.id, {
    x:
      (source.transform.x +
        source.transform.width / 2 +
        target.transform.x +
        target.transform.width / 2) /
      2,
    y:
      (source.transform.y +
        source.transform.height / 2 +
        target.transform.y +
        target.transform.height / 2) /
      2
  });
});
required<HTMLButtonElement>("#remove-waypoint").addEventListener("click", () => {
  const state = designer.getState();
  const connection = state.document.connections.find(({ id }) =>
    state.selection.selectedConnectionIds.includes(id)
  );
  if (connection !== undefined && connection.waypoints.length > 0)
    designer.removeWaypoint(connection.id, connection.waypoints.length - 1);
});

function resizeCanvas(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.resize({ width, height });
  overlay.resize(width, height);
}

designer.subscribeState(({ state }) => {
  accessibility.update(designerAccessibilityNodes(designer));
  const selectionMessage = `${String(state.selection.selectedNodeIds.length)} nodes and ${String(state.selection.selectedConnectionIds.length)} connections selected`;
  if (selectionMessage !== accessibilitySelection) {
    accessibilitySelection = selectionMessage;
    accessibility.announce({
      message: selectionMessage,
      kind: "selection",
      timestamp: performance.now()
    });
    accessibility.flushAnnouncements();
  }
  overlay.render(state);
  renderInspector();
  undoButton.disabled = !state.canUndo;
  redoButton.disabled = !state.canRedo;
  viewportStatus.value = `${String(Math.round(state.viewport.zoom * 100))}%`;
  status.value = `${String(state.selection.selectedNodeIds.length)} nodes · ${String(state.selection.selectedConnectionIds.length)} connections`;
});

const observer = new ResizeObserver(resizeCanvas);
observer.observe(canvas);
resizeCanvas();
overlay.render(designer.getRuntimeState());
renderInspector();

window.addEventListener("beforeunload", () => {
  contrastPreference.removeEventListener("change", updateAccessibilityPreferences);
  motionPreference.removeEventListener("change", updateAccessibilityPreferences);
  accessibility.dispose();
  observer.disconnect();
  toolController.dispose();
  designer.dispose();
  renderer.dispose();
});
