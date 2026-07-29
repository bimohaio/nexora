import { UlidEntityIdGenerator, type JsonValue, type ScadaNode } from "@web-scada/core";
import {
  BindingAuthoringService,
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
  createInitialSvgSymbolRendererRegistry,
  createSvgRenderer,
  resolveEntityMetadata,
  zoomViewportAtPoint
} from "@web-scada/renderer-svg";
import {
  createIndustrialSymbolRegistry,
  createStandardSymbolCategoryRegistry,
  type SymbolDefinition
} from "@web-scada/symbols";

import { DESIGNER_SAMPLE_DOCUMENT } from "./sample-document.js";
import { DesignerOverlay } from "./overlay.js";
import {
  loadSymbolLibraryPreferences,
  normalizeSymbolLibrary,
  querySymbolLibrary,
  recordRecent,
  saveSymbolLibraryPreferences,
  readSymbolDragData,
  symbolDisplayName,
  toggleFavorite,
  writeSymbolDragData,
  SYMBOL_LIBRARY_DRAG_TYPE,
  type SymbolLibraryItem,
  type SymbolLibraryPreferences,
  type SymbolLibrarySort,
  type SymbolLibraryView
} from "./symbol-library.js";
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
const symbolResults = required<HTMLOutputElement>("#symbol-results");
const symbolTotal = required<HTMLOutputElement>("#symbol-total");
const symbolSearchClear = required<HTMLButtonElement>("#symbol-search-clear");
const symbolCategoryMenu = required<HTMLDetailsElement>("#symbol-category-menu");
const symbolCategoryLabel = required<HTMLElement>("#symbol-category-label");
const symbolCategoryOptions = required<HTMLElement>("#symbol-category-options");
const symbolSort = required<HTMLSelectElement>("#symbol-sort");
const status = required<HTMLOutputElement>("#status");
const viewportStatus = required<HTMLOutputElement>("#viewport-status");
const inspector = required<HTMLFormElement>("#node-inspector");
const emptyInspector = required<HTMLElement>("#empty-inspector");
const variantField = required<HTMLElement>("#variant-field");
const undoButton = required<HTMLButtonElement>("#undo");
const redoButton = required<HTMLButtonElement>("#redo");
const bindingPanel = required<HTMLElement>("#binding-panel");
const bindingList = required<HTMLElement>("#binding-list");
const bindingCount = required<HTMLOutputElement>("#binding-count");
const bindingForm = required<HTMLFormElement>("#binding-form");
const bindingFormStatus = required<HTMLOutputElement>("#binding-form-status");
const bindingSourceLabel = required<HTMLElement>("#binding-source-label");
const symbols = createIndustrialSymbolRegistry();
const symbolCategories = createStandardSymbolCategoryRegistry();
const symbolVisuals = createInitialSvgSymbolRendererRegistry();
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
const bindingAuthoring = new BindingAuthoringService({
  designer,
  symbols,
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

function localScreenPoint(event: { readonly clientX: number; readonly clientY: number }): {
  x: number;
  y: number;
} {
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
canvas.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes(SYMBOL_LIBRARY_DRAG_TYPE)) return;
  event.dataTransfer.dropEffect = "copy";
  canvas.dataset.symbolDropTarget = "true";
  event.preventDefault();
});
canvas.addEventListener("dragleave", (event) => {
  if (!canvas.contains(event.relatedTarget as Node | null)) delete canvas.dataset.symbolDropTarget;
});
canvas.addEventListener("drop", (event) => {
  delete canvas.dataset.symbolDropTarget;
  if (event.dataTransfer === null) return;
  const type = readSymbolDragData(event.dataTransfer, knownSymbolTypes);
  if (type === undefined) return;
  const definition = symbols.get(type);
  if (definition === undefined) return;
  insertLibrarySymbol(definition, designer.toCanvasPoint(localScreenPoint(event)));
  event.preventDefault();
});

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
  return symbolDisplayName(definition);
}

function defaultProperties(definition: SymbolDefinition): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    definition.editableProperties.flatMap(({ key, defaultValue }) =>
      defaultValue === undefined ? [] : ([[key, defaultValue]] as const)
    )
  );
}

interface PaletteVisual {
  readonly renderer: NonNullable<ReturnType<typeof symbolVisuals.get>>;
  readonly element: SVGGElement;
}

let paletteObserver: IntersectionObserver | undefined;
let paletteVisuals: PaletteVisual[] = [];
const libraryItems = normalizeSymbolLibrary(symbols.getAll(), symbolCategories.list());
const knownSymbolTypes = new Set(libraryItems.map(({ definition }) => definition.type));
const preferenceStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
let libraryPreferences = loadSymbolLibraryPreferences(preferenceStorage, knownSymbolTypes);
let activeCategory = "";
const expandedCategories = new Set<string>();
const expandedCategoryItems = new Set<string>();
const firstCategory = symbolCategories
  .list()
  .find(({ id }) => libraryItems.some(({ definition }) => definition.category === id));
if (firstCategory !== undefined) expandedCategories.add(firstCategory.id);
symbolTotal.value = String(libraryItems.length);

function persistLibraryPreferences(
  changes: Partial<Pick<SymbolLibraryPreferences, "view" | "sort" | "favorites" | "recent">>
): void {
  libraryPreferences = Object.freeze({ ...libraryPreferences, ...changes, version: 1 });
  saveSymbolLibraryPreferences(preferenceStorage, libraryPreferences);
}

function disposePaletteVisuals(): void {
  paletteObserver?.disconnect();
  paletteObserver = undefined;
  for (const visual of paletteVisuals) visual.renderer.dispose?.(visual.element);
  paletteVisuals = [];
}

function mountPalettePreview(host: SVGSVGElement, definition: SymbolDefinition): void {
  if (host.childElementCount > 0) return;
  const visual = symbolVisuals.get(definition.type);
  if (visual === undefined) {
    host.dataset.previewError = "missing-renderer";
    const fallback = document.createElementNS("http://www.w3.org/2000/svg", "text");
    fallback.textContent = "?";
    fallback.setAttribute("x", "50%");
    fallback.setAttribute("y", "55%");
    fallback.setAttribute("text-anchor", "middle");
    fallback.setAttribute("fill", "#94a3b8");
    fallback.setAttribute("font-size", "24");
    host.setAttribute("viewBox", "0 0 64 48");
    host.append(fallback);
    return;
  }
  const properties = { ...defaultProperties(definition), labelVisible: false };
  const previewNode: ScadaNode = {
    id: `palette_${definition.type.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
    name: displayName(definition),
    symbolType: definition.type,
    transform: {
      x: 0,
      y: 0,
      width: definition.defaultWidth,
      height: definition.defaultHeight,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    properties,
    bindings: [],
    layerId: designer.getState().document.layers[0]?.id ?? "main",
    visible: true,
    locked: false
  };
  host.setAttribute(
    "viewBox",
    `0 0 ${String(definition.defaultWidth)} ${String(definition.defaultHeight)}`
  );
  const element = visual.create({
    document: designer.getState().document,
    node: previewNode,
    state: "normal"
  });
  element.setAttribute("aria-hidden", "true");
  host.append(element);
  paletteVisuals.push({ renderer: visual, element });
}

function insertLibrarySymbol(
  definition: SymbolDefinition,
  position?: Readonly<{ x: number; y: number }>
): void {
  const layerId = designer.getState().document.layers[0]?.id;
  if (layerId === undefined) return;
  const index = designer.getState().document.nodes.length;
  const x =
    position === undefined ? 180 + (index % 5) * 40 : position.x - definition.defaultWidth / 2;
  const y =
    position === undefined ? 140 + (index % 4) * 40 : position.y - definition.defaultHeight / 2;
  designer.insertNode({
    id: ids.createNodeId(),
    name: displayName(definition),
    symbolType: definition.type,
    transform: {
      x,
      y,
      width: definition.defaultWidth,
      height: definition.defaultHeight,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    properties: defaultProperties(definition),
    bindings: [],
    layerId,
    visible: true,
    locked: false
  });
  persistLibraryPreferences({
    recent: recordRecent(libraryPreferences.recent, definition.type)
  });
  renderPalette();
}

interface PreviewHost {
  readonly host: SVGSVGElement;
  readonly definition: SymbolDefinition;
}

function createSymbolCard(item: SymbolLibraryItem, previewHosts: PreviewHost[]): HTMLElement {
  const { definition } = item;
  const card = document.createElement("article");
  card.className = "symbol-palette-item";
  card.dataset.paletteSymbol = definition.type;
  card.draggable = true;
  const insert = document.createElement("button");
  insert.type = "button";
  insert.className = "symbol-insert";
  insert.title = `${item.displayName} · ${definition.type}`;
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  preview.classList.add("symbol-palette-preview");
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", `${item.displayName} preview`);
  const details = document.createElement("span");
  details.className = "symbol-palette-details";
  const name = document.createElement("strong");
  name.textContent = item.displayName;
  const secondary = document.createElement("span");
  secondary.className = "symbol-secondary";
  const type = document.createElement("code");
  type.textContent = definition.type;
  const category = document.createElement("small");
  category.textContent = item.categoryName;
  secondary.append(type, category);
  details.append(name, secondary);
  insert.append(preview, details);
  previewHosts.push({ host: preview, definition });
  insert.addEventListener("click", () => {
    insertLibrarySymbol(definition);
  });

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "symbol-favorite";
  favorite.draggable = false;
  const isFavorite = libraryPreferences.favorites.includes(definition.type);
  favorite.setAttribute("aria-pressed", String(isFavorite));
  favorite.setAttribute(
    "aria-label",
    `${isFavorite ? "Remove" : "Add"} ${item.displayName} ${isFavorite ? "from" : "to"} favorites`
  );
  favorite.textContent = isFavorite ? "★" : "☆";
  favorite.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  favorite.addEventListener("click", (event) => {
    event.stopPropagation();
    persistLibraryPreferences({
      favorites: toggleFavorite(libraryPreferences.favorites, definition.type)
    });
    renderPalette();
  });
  card.addEventListener("dragstart", (event) => {
    if (event.dataTransfer === null) return;
    event.dataTransfer.effectAllowed = "copy";
    writeSymbolDragData(event.dataTransfer, definition.type);
    card.dataset.dragging = "true";
  });
  card.addEventListener("dragend", () => {
    delete card.dataset.dragging;
  });
  card.append(insert, favorite);
  return card;
}

function createSection(
  title: string,
  items: readonly SymbolLibraryItem[],
  previewHosts: PreviewHost[],
  options: { readonly categoryId?: string; readonly alwaysExpanded?: boolean } = {}
): HTMLElement {
  const section = document.createElement("section");
  section.className = "symbol-category-section";
  const heading = document.createElement("button");
  heading.type = "button";
  heading.className = "symbol-category-heading";
  const categoryId = options.categoryId;
  const expanded =
    options.alwaysExpanded === true ||
    categoryId === undefined ||
    expandedCategories.has(categoryId);
  heading.setAttribute("aria-expanded", String(expanded));
  const titleText = document.createElement("strong");
  titleText.textContent = title;
  const count = document.createElement("span");
  count.textContent = String(items.length);
  const chevron = document.createElement("span");
  chevron.className = "symbol-category-chevron";
  chevron.textContent = expanded ? "⌃" : "⌄";
  heading.append(titleText, count, chevron);
  const content = document.createElement("div");
  content.className = `symbol-items symbol-items-${libraryPreferences.view}`;
  content.hidden = !expanded;
  if (categoryId !== undefined)
    heading.addEventListener("click", () => {
      if (expandedCategories.has(categoryId)) expandedCategories.delete(categoryId);
      else expandedCategories.add(categoryId);
      renderPalette();
    });
  const showAll =
    options.alwaysExpanded === true ||
    categoryId === undefined ||
    expandedCategoryItems.has(categoryId);
  const visibleItems = showAll ? items : items.slice(0, 8);
  for (const item of visibleItems) content.append(createSymbolCard(item, previewHosts));
  if (!showAll && items.length > visibleItems.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "symbol-view-all";
    more.textContent = `View all ${String(items.length)}`;
    more.addEventListener("click", () => {
      expandedCategoryItems.add(categoryId);
      renderPalette();
    });
    content.append(more);
  }
  section.append(heading, content);
  return section;
}

function renderPalette(): void {
  disposePaletteVisuals();
  palette.replaceChildren();
  palette.dataset.view = libraryPreferences.view;
  const query = search.value;
  const favorites = new Set(libraryPreferences.favorites);
  const items = querySymbolLibrary(libraryItems, {
    query,
    category: activeCategory,
    sort: libraryPreferences.sort,
    favorites
  });
  symbolResults.value = `${String(items.length)} result${items.length === 1 ? "" : "s"}`;
  symbolSearchClear.hidden = search.value === "";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-symbol-view]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.symbolView === libraryPreferences.view)
    );
  symbolSort.value = libraryPreferences.sort;
  const previewHosts: PreviewHost[] = [];
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "symbol-library-empty";
    const title = document.createElement("strong");
    title.textContent = "No symbols found";
    const context = document.createElement("p");
    context.textContent =
      search.value === "" ? "Try another category." : `No results for “${search.value.trim()}”.`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear filters";
    clear.addEventListener("click", () => {
      search.value = "";
      activeCategory = "";
      symbolCategoryLabel.textContent = "All categories";
      renderPalette();
    });
    empty.append(title, context, clear);
    palette.append(empty);
  } else if (query.trim() !== "" || activeCategory !== "") {
    const content = document.createElement("div");
    content.className = `symbol-items symbol-items-${libraryPreferences.view}`;
    for (const item of items) content.append(createSymbolCard(item, previewHosts));
    palette.append(content);
  } else {
    const favoriteItems = libraryPreferences.favorites
      .map((type) => items.find(({ definition }) => definition.type === type))
      .filter((item): item is SymbolLibraryItem => item !== undefined);
    if (favoriteItems.length > 0)
      palette.append(
        createSection("Favorites", favoriteItems, previewHosts, { alwaysExpanded: true })
      );
    const recentItems = libraryPreferences.recent
      .map((type) => items.find(({ definition }) => definition.type === type))
      .filter((item): item is SymbolLibraryItem => item !== undefined);
    if (recentItems.length > 0)
      palette.append(createSection("Recent", recentItems, previewHosts, { alwaysExpanded: true }));
    const grouped = new Map<string, SymbolLibraryItem[]>();
    for (const item of items) {
      const values = grouped.get(item.definition.category) ?? [];
      values.push(item);
      grouped.set(item.definition.category, values);
    }
    for (const category of symbolCategories.list()) {
      const categoryItems = grouped.get(category.id);
      if (categoryItems === undefined || categoryItems.length === 0) continue;
      palette.append(
        createSection(category.displayName, categoryItems, previewHosts, {
          categoryId: category.id
        })
      );
    }
  }
  const canObserve =
    typeof IntersectionObserver !== "undefined" &&
    IntersectionObserver.toString().includes("[native code]");
  if (canObserve) {
    paletteObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting && entry.target instanceof SVGSVGElement) {
            const target = previewHosts.find(({ host }) => host === entry.target);
            if (target !== undefined) mountPalettePreview(target.host, target.definition);
            paletteObserver?.unobserve(entry.target);
          }
      },
      { root: palette, rootMargin: "180px" }
    );
    for (const { host } of previewHosts) paletteObserver.observe(host);
  } else for (const { host, definition } of previewHosts) mountPalettePreview(host, definition);
}

search.addEventListener("input", () => {
  renderPalette();
});
search.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && search.value !== "") {
    search.value = "";
    renderPalette();
  }
});
symbolSearchClear.addEventListener("click", () => {
  search.value = "";
  search.focus();
  renderPalette();
});
symbolSort.addEventListener("change", () => {
  persistLibraryPreferences({ sort: symbolSort.value as SymbolLibrarySort });
  renderPalette();
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-symbol-view]"))
  button.addEventListener("click", () => {
    persistLibraryPreferences({ view: button.dataset.symbolView as SymbolLibraryView });
    renderPalette();
  });
const categoriesWithCounts = symbolCategories
  .list()
  .map((category) => ({
    category,
    count: libraryItems.filter(({ definition }) => definition.category === category.id).length
  }))
  .filter(({ count }) => count > 0);
for (const option of [
  { id: "", displayName: "All categories", count: libraryItems.length },
  ...categoriesWithCounts.map(({ category, count }) => ({
    id: category.id,
    displayName: category.displayName,
    count
  }))
]) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "option";
  button.dataset.category = option.id;
  button.setAttribute("aria-selected", String(option.id === activeCategory));
  const name = document.createElement("span");
  name.textContent = option.displayName;
  const count = document.createElement("span");
  count.textContent = String(option.count);
  button.append(name, count);
  button.addEventListener("click", () => {
    activeCategory = option.id;
    symbolCategoryLabel.textContent = option.displayName;
    symbolCategoryMenu.open = false;
    for (const categoryButton of symbolCategoryOptions.querySelectorAll("button"))
      categoryButton.setAttribute(
        "aria-selected",
        String(categoryButton.getAttribute("data-category") === activeCategory)
      );
    renderPalette();
  });
  symbolCategoryOptions.append(button);
}
renderPalette();

window.addEventListener("beforeunload", disposePaletteVisuals);

function field(name: string): HTMLInputElement {
  const result = inspector.elements.namedItem(name);
  if (!(result instanceof HTMLInputElement)) throw new Error(`Inspector field missing: ${name}`);
  return result;
}

function bindingSelect(name: string): HTMLSelectElement {
  const result = bindingForm.elements.namedItem(name);
  if (!(result instanceof HTMLSelectElement)) throw new Error(`Binding field missing: ${name}`);
  return result;
}

function inspectorSelect(name: string): HTMLSelectElement {
  const result = inspector.elements.namedItem(name);
  if (!(result instanceof HTMLSelectElement)) throw new Error(`Inspector field missing: ${name}`);
  return result;
}

function bindingInput(name: string): HTMLInputElement {
  const result = bindingForm.elements.namedItem(name);
  if (!(result instanceof HTMLInputElement)) throw new Error(`Binding field missing: ${name}`);
  return result;
}

function bindingButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderBindings(): void {
  const state = designer.getState();
  const nodeId = state.selection.selectedNodeIds[0];
  const singleNode = state.selection.selectedNodeIds.length === 1;
  bindingPanel.hidden = !singleNode;
  if (!singleNode || nodeId === undefined) return;

  const properties = bindingAuthoring.properties(nodeId).filter(({ bindable }) => bindable);
  const propertySelect = bindingSelect("property");
  const currentProperty = propertySelect.value;
  propertySelect.replaceChildren(
    ...properties.map((property) => {
      const option = document.createElement("option");
      option.value = property.key;
      option.textContent = `${property.key} · ${property.dataTypes.join(" / ") || "JSON"}`;
      return option;
    })
  );
  if (properties.some(({ key }) => key === currentProperty)) propertySelect.value = currentProperty;

  const bindings = bindingAuthoring
    .list()
    .filter(({ target }) => "nodeId" in target && target.nodeId === nodeId);
  bindingCount.value = String(bindings.length);
  bindingList.replaceChildren();
  if (bindings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "binding-empty";
    empty.textContent = "No bindings yet. Create one below.";
    bindingList.append(empty);
  }
  for (const binding of bindings) {
    const preview = bindingAuthoring.preview(binding);
    const card = document.createElement("article");
    card.className = "binding-card";
    card.dataset.bindingId = binding.id;
    card.dataset.enabled = String(binding.enabled);

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent =
      binding.target.type === "node-property" ? binding.target.property : binding.target.type;
    const badge = document.createElement("span");
    badge.className = binding.enabled ? "binding-badge enabled" : "binding-badge disabled";
    badge.textContent = binding.enabled ? "ACTIVE" : "PAUSED";
    header.append(title, badge);

    const source = document.createElement("code");
    source.textContent = preview?.sourceLabel ?? binding.source.type;
    const target = document.createElement("small");
    target.textContent = `→ ${preview?.targetLabel ?? "Unknown target"}`;

    const validation = document.createElement("p");
    validation.className = preview?.diagnostics.length === 0 ? "binding-valid" : "binding-invalid";
    validation.textContent =
      preview?.diagnostics.length === 0
        ? "✓ Definition valid · evaluated only at runtime"
        : `⚠ ${preview?.diagnostics[0]?.message ?? "Invalid definition"}`;

    const actions = document.createElement("div");
    actions.className = "binding-actions";
    actions.append(
      bindingButton(binding.enabled ? "Pause" : "Enable", () => {
        bindingAuthoring.update(binding.id, { enabled: !binding.enabled });
      }),
      bindingButton("Duplicate", () => {
        bindingAuthoring.duplicate(binding.id);
      }),
      bindingButton("Delete", () => {
        bindingAuthoring.remove(binding.id);
      })
    );
    card.append(header, source, target, validation, actions);
    bindingList.append(card);
  }
}

bindingSelect("sourceType").addEventListener("change", () => {
  const type = bindingSelect("sourceType").value;
  bindingSourceLabel.textContent =
    type === "expression"
      ? "Safe expression"
      : type === "constant"
        ? "Constant (JSON)"
        : "Runtime tag ID";
  bindingInput("source").value =
    type === "expression"
      ? "tag('plant.cooling.level') * 100"
      : type === "constant"
        ? "42"
        : "plant.cooling.level";
});

bindingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nodeId = designer.getState().selection.selectedNodeIds[0];
  const property = bindingSelect("property").value;
  if (nodeId === undefined || property === "") return;
  const sourceType = bindingSelect("sourceType").value;
  const sourceText = bindingInput("source").value;
  try {
    const fallbackText = bindingInput("fallback").value.trim();
    const fallback = fallbackText === "" ? undefined : (JSON.parse(fallbackText) as JsonValue);
    const source =
      sourceType === "expression"
        ? ({ type: "expression", expression: sourceText } as const)
        : sourceType === "constant"
          ? ({ type: "constant", value: JSON.parse(sourceText) as JsonValue } as const)
          : ({ type: "tag", tagId: sourceText } as const);
    const result = bindingAuthoring.create({
      source,
      target: { type: "node-property", nodeId, property },
      mode: "one-way",
      enabled: true,
      ...(fallback === undefined ? {} : { fallback })
    });
    bindingFormStatus.dataset.status = result.success ? "success" : "error";
    bindingFormStatus.value = result.success
      ? "Binding created. It will be evaluated only at runtime."
      : (result.diagnostics[0]?.message ?? "Binding validation failed.");
  } catch {
    bindingFormStatus.dataset.status = "error";
    bindingFormStatus.value = "Source and fallback must contain valid JSON.";
  }
});

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
  const definition = symbols.get(node.symbolType);
  const variants = definition?.variants ?? [];
  variantField.hidden = variants.length === 0;
  const variantSelect = inspectorSelect("variant");
  variantSelect.replaceChildren();
  for (const variant of variants) {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = variant.id.replaceAll("-", " ");
    variantSelect.append(option);
  }
  variantSelect.value =
    typeof node.properties.variant === "string" ? node.properties.variant : (variants[0]?.id ?? "");
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
    properties: {
      ...node.properties,
      fill: field("fill").value,
      ...(variantField.hidden ? {} : { variant: inspectorSelect("variant").value })
    }
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
  renderBindings();
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
renderBindings();

window.addEventListener("beforeunload", () => {
  contrastPreference.removeEventListener("change", updateAccessibilityPreferences);
  motionPreference.removeEventListener("change", updateAccessibilityPreferences);
  accessibility.dispose();
  observer.disconnect();
  toolController.dispose();
  designer.dispose();
  renderer.dispose();
});
