import {
  UlidEntityIdGenerator,
  createEmptyChangeSet,
  mergeChangeSets,
  type ScadaConnection,
  type ScadaDocument,
  type JsonValue,
  type ScadaLayer,
  type ScadaNode,
  type PortDefinition
} from "@web-scada/core";
import { calculatePortPosition, type Point, type Size, type Viewport } from "@web-scada/geometry";
import {
  calculateViewportTransform,
  createGridConfiguration,
  createNodeTransform,
  createPathData,
  fitRectangleToViewport,
  normalizeRenderChangeSet,
  resolveConnectionPoints,
  zoomViewportAtPoint
} from "./calculations.js";
import {
  DEFAULT_RENDERER_OPTIONS,
  type EntityPointerMetadata,
  type RenderChangeSet,
  type RendererEventType,
  type RendererOptions,
  type SvgRenderer,
  type SvgRendererDependencies,
  type SvgSymbolRenderContext,
  type SvgSymbolRendererRegistry
} from "./contracts.js";
import {
  createSvgElement,
  portKey,
  resolveEntityMetadata,
  setDataAttributes,
  setOptionalAttribute
} from "./dom.js";
import { RendererError } from "./errors.js";
import {
  FALLBACK_SYMBOL_RENDERER,
  createInitialSvgSymbolRendererRegistry,
  runtimeStateClass
} from "./symbol-renderers.js";

interface LayerElements {
  readonly root: SVGGElement;
  readonly connections: SVGGElement;
  readonly nodes: SVGGElement;
  readonly ports: SVGGElement;
}

const EMPTY_CONTEXT: Readonly<Record<string, never>> = {};

export class NativeSvgRenderer implements SvgRenderer {
  readonly #symbols: SvgRendererDependencies["symbols"];
  readonly #symbolRenderers: SvgSymbolRendererRegistry;
  readonly #onEvent: SvgRendererDependencies["onEvent"];
  readonly #logger: SvgRendererDependencies["logger"];
  readonly #runtimeState: SvgRendererDependencies["runtimeState"];
  readonly #definitionPrefix: string;
  readonly #nodeElements = new Map<string, SVGGElement>();
  readonly #connectionElements = new Map<string, SVGPathElement>();
  readonly #connectionHitElements = new Map<string, SVGPathElement>();
  readonly #layerElements = new Map<string, LayerElements>();
  readonly #portElements = new Map<string, SVGElement>();
  readonly #listeners: {
    readonly type: string;
    readonly listener: EventListener;
  }[] = [];
  #options: RendererOptions;
  #svg: SVGSVGElement | undefined;
  #defs: SVGDefsElement | undefined;
  #background: SVGRectElement | undefined;
  #grid: SVGGElement | undefined;
  #viewportElement: SVGGElement | undefined;
  #layersElement: SVGGElement | undefined;
  #debug: SVGGElement | undefined;
  #document: ScadaDocument | undefined;
  #viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  #size: Size = { width: 1, height: 1 };
  #disposed = false;
  #pendingFrame: number | undefined;
  #pendingDocument: ScadaDocument | undefined;
  #pendingChanges: RenderChangeSet | undefined;

  public constructor(dependencies: SvgRendererDependencies) {
    this.#symbols = dependencies.symbols;
    this.#symbolRenderers =
      dependencies.symbolRenderers ?? createInitialSvgSymbolRendererRegistry();
    this.#onEvent = dependencies.onEvent;
    this.#logger = dependencies.logger;
    this.#runtimeState = dependencies.runtimeState;
    this.#options = { ...DEFAULT_RENDERER_OPTIONS, ...dependencies.options };
    this.#definitionPrefix = new UlidEntityIdGenerator().create("group").replaceAll("_", "-");
  }

  public mount(container: HTMLElement): void {
    this.#assertUsable();
    if (this.#svg !== undefined)
      throw new RendererError("RENDERER_ALREADY_MOUNTED", "Renderer is already mounted.");
    if (!(container instanceof HTMLElement))
      throw new RendererError("RENDER_TARGET_INVALID", "Render target must be an HTMLElement.");

    const svg = createSvgElement("svg");
    svg.dataset.scadaRoot = "";
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", this.#options.ariaLabel);
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.display = "block";
    svg.style.touchAction = "none";
    svg.style.userSelect = "none";

    const defs = createSvgElement("defs");
    defs.dataset.scadaDefs = "";
    const background = createSvgElement("rect");
    background.dataset.scadaBackground = "";
    const grid = createSvgElement("g");
    grid.dataset.scadaGrid = "";
    const viewport = createSvgElement("g");
    viewport.dataset.scadaViewport = "";
    const scene = createSvgElement("g");
    scene.dataset.scadaScene = "";
    const layers = createSvgElement("g");
    layers.dataset.scadaLayers = "";
    const overlay = createSvgElement("g");
    overlay.dataset.scadaOverlay = "";
    const debug = createSvgElement("g");
    debug.dataset.scadaDebug = "";
    scene.append(layers);
    viewport.append(scene);
    svg.append(defs, background, grid, viewport, overlay, debug);
    container.append(svg);

    this.#svg = svg;
    this.#defs = defs;
    this.#background = background;
    this.#grid = grid;
    this.#viewportElement = viewport;
    this.#layersElement = layers;
    this.#debug = debug;
    this.#installDelegatedListeners();
    this.resize({
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight)
    });
    this.#applyViewport();
    this.#emit("renderer-mounted");
  }

  public unmount(): void {
    if (this.#svg === undefined) return;
    this.#cancelScheduledFrame();
    for (const { type, listener } of this.#listeners) this.#svg.removeEventListener(type, listener);
    this.#listeners.length = 0;
    this.#svg.remove();
    this.#clearEntityMaps();
    this.#svg = undefined;
    this.#defs = undefined;
    this.#background = undefined;
    this.#grid = undefined;
    this.#viewportElement = undefined;
    this.#layersElement = undefined;
    this.#debug = undefined;
    this.#emit("renderer-unmounted");
  }

  public renderDocument(document: ScadaDocument): void {
    this.#assertMounted();
    this.#emit("render-started");
    try {
      this.#document = document;
      this.#clearEntityMaps();
      this.#layersElement?.replaceChildren();
      this.#renderDefinitions();
      this.#renderCanvas();
      for (const layer of [...document.layers].sort((a, b) => a.order - b.order))
        this.#createLayer(layer);
      for (const connection of document.connections) this.#renderConnection(connection);
      for (const node of document.nodes) this.#renderNode(node);
      this.#emit(
        "render-completed",
        {},
        {
          nodeCount: document.nodes.length,
          connectionCount: document.connections.length
        }
      );
    } catch (error) {
      this.#emit("render-failed");
      throw error instanceof RendererError
        ? error
        : new RendererError(
            "RENDER_DOCUMENT_FAILED",
            error instanceof Error ? error.message : "Document rendering failed."
          );
    }
  }

  public renderChanges(document: ScadaDocument, changes: RenderChangeSet): void {
    this.#assertMounted();
    if (this.#document === undefined || changes.symbolRegistryChanged === true) {
      this.renderDocument(document);
      return;
    }
    const normalized = normalizeRenderChangeSet(changes);
    this.#document = document;
    if (normalized.canvasChanged) this.#renderCanvas();
    for (const id of normalized.removedConnectionIds) this.#removeConnection(id);
    for (const id of normalized.removedNodeIds) this.#removeNode(id);
    for (const id of normalized.removedLayerIds) this.#removeLayer(id);
    for (const id of normalized.addedLayerIds) {
      const layer = document.layers.find(({ id: candidate }) => candidate === id);
      if (layer !== undefined) this.#createLayer(layer);
    }
    for (const id of normalized.updatedLayerIds) {
      const layer = document.layers.find(({ id: candidate }) => candidate === id);
      if (layer !== undefined) this.#updateLayer(layer);
    }
    this.#reorderLayers(document.layers);

    const changedNodeIds = new Set([...normalized.addedNodeIds, ...normalized.updatedNodeIds]);
    for (const id of changedNodeIds) {
      const node = document.nodes.find(({ id: candidate }) => candidate === id);
      if (node !== undefined) this.#renderNode(node);
    }
    const affectedConnectionIds = new Set([
      ...normalized.addedConnectionIds,
      ...normalized.updatedConnectionIds
    ]);
    for (const connection of document.connections)
      if (
        changedNodeIds.has(connection.source.nodeId) ||
        changedNodeIds.has(connection.target.nodeId)
      )
        affectedConnectionIds.add(connection.id);
    for (const id of affectedConnectionIds) {
      const connection = document.connections.find(({ id: candidate }) => candidate === id);
      if (connection !== undefined) this.#renderConnection(connection);
    }
    if (normalized.viewportChanged === true) this.#applyViewport();
    this.#emit(
      "render-completed",
      {},
      {
        nodeCount: changedNodeIds.size,
        connectionCount: affectedConnectionIds.size
      }
    );
  }

  public scheduleRenderChanges(document: ScadaDocument, changes: RenderChangeSet): void {
    this.#assertMounted();
    this.#pendingDocument = document;
    this.#pendingChanges =
      this.#pendingChanges === undefined
        ? changes
        : {
            ...mergeChangeSets(this.#pendingChanges, changes),
            viewportChanged:
              this.#pendingChanges.viewportChanged === true || changes.viewportChanged === true,
            symbolRegistryChanged:
              this.#pendingChanges.symbolRegistryChanged === true ||
              changes.symbolRegistryChanged === true
          };
    if (this.#pendingFrame !== undefined) return;
    this.#pendingFrame = requestAnimationFrame(() => {
      this.#pendingFrame = undefined;
      const pendingDocument = this.#pendingDocument;
      const pendingChanges = this.#pendingChanges;
      this.#pendingDocument = undefined;
      this.#pendingChanges = undefined;
      if (pendingDocument !== undefined && pendingChanges !== undefined)
        this.renderChanges(pendingDocument, pendingChanges);
    });
  }

  public setViewport(viewport: Viewport): void {
    this.#assertMounted();
    this.#viewport = {
      x: viewport.x,
      y: viewport.y,
      zoom: Math.min(this.#options.maxZoom, Math.max(this.#options.minZoom, viewport.zoom))
    };
    this.#applyViewport();
    this.#emit(
      "viewport-changed",
      {},
      {
        x: this.#viewport.x,
        y: this.#viewport.y,
        zoom: this.#viewport.zoom
      }
    );
  }

  public setZoom(zoom: number, anchor?: Point): void {
    const actualAnchor = anchor ?? { x: this.#size.width / 2, y: this.#size.height / 2 };
    this.setViewport(
      zoomViewportAtPoint(
        this.#viewport,
        zoom,
        actualAnchor,
        this.#options.minZoom,
        this.#options.maxZoom
      )
    );
  }

  public panBy(delta: Point): void {
    this.setViewport({
      ...this.#viewport,
      x: this.#viewport.x + delta.x,
      y: this.#viewport.y + delta.y
    });
  }

  public fitToView(padding = 32): void {
    this.#assertMounted();
    if (this.#document === undefined) return;
    this.setViewport(
      fitRectangleToViewport(
        {
          x: 0,
          y: 0,
          width: this.#document.canvas.width,
          height: this.#document.canvas.height
        },
        this.#size,
        padding,
        this.#options.minZoom,
        this.#options.maxZoom
      )
    );
  }

  public resetViewport(): void {
    this.setViewport(this.#document?.canvas.defaultViewport ?? { x: 0, y: 0, zoom: 1 });
  }

  public resize(size: Size): void {
    this.#assertMounted();
    if (
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height) ||
      size.width <= 0 ||
      size.height <= 0
    )
      throw new RendererError("RENDER_TARGET_INVALID", "Renderer size must be positive.");
    this.#size = size;
    this.#svg?.setAttribute("width", String(size.width));
    this.#svg?.setAttribute("height", String(size.height));
    this.#svg?.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    this.#renderCanvas();
  }

  public setOptions(options: Partial<RendererOptions>): void {
    this.#options = { ...this.#options, ...options };
    if (this.#svg !== undefined) {
      this.#svg.setAttribute("aria-label", this.#options.ariaLabel);
      if (this.#document !== undefined) {
        this.#renderDefinitions();
        this.#renderCanvas();
        for (const node of this.#document.nodes) this.#renderNode(node);
      }
    }
  }

  public refreshRuntimeStates(nodeIds?: readonly string[]): void {
    if (this.#document === undefined) return;
    const requested = nodeIds === undefined ? undefined : new Set(nodeIds);
    for (const node of this.#document.nodes)
      if (requested === undefined || requested.has(node.id)) this.#renderNode(node);
  }

  public getViewport(): Viewport {
    return { ...this.#viewport };
  }

  public getElementForNode(nodeId: string): SVGGElement | undefined {
    return this.#nodeElements.get(nodeId);
  }

  public getElementForConnection(connectionId: string): SVGPathElement | undefined {
    return this.#connectionElements.get(connectionId);
  }

  public getElementForPort(nodeId: string, portId: string): SVGElement | undefined {
    return this.#portElements.get(portKey(nodeId, portId));
  }

  public getSvgElement(): SVGSVGElement | undefined {
    return this.#svg;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.unmount();
    this.#document = undefined;
    this.#clearEntityMaps();
    this.#disposed = true;
  }

  #renderDefinitions(): void {
    const defs = this.#defs;
    if (defs === undefined) return;
    defs.replaceChildren();
    for (const [name, orient] of [
      ["arrow-end", "auto"],
      ["arrow-start", "auto-start-reverse"]
    ] as const) {
      const marker = createSvgElement("marker");
      marker.id = `${this.#definitionPrefix}-${name}`;
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", orient);
      const path = createSvgElement("path");
      path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      path.setAttribute("fill", "context-stroke");
      marker.append(path);
      defs.append(marker);
    }
    this.#renderGridPattern();
  }

  #renderGridPattern(): void {
    if (this.#defs === undefined || this.#document === undefined) return;
    const size = this.#options.gridSize ?? this.#document.canvas.gridSize;
    const configuration = createGridConfiguration(this.#options.gridPattern, size);
    const pattern = createSvgElement("pattern");
    pattern.id = `${this.#definitionPrefix}-grid`;
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    if (configuration.pattern === "dots") {
      const circle = createSvgElement("circle");
      circle.setAttribute("cx", String(configuration.dot?.x ?? 1));
      circle.setAttribute("cy", String(configuration.dot?.y ?? 1));
      circle.setAttribute("r", "1");
      circle.setAttribute("fill", "var(--scada-grid-color, #334155)");
      pattern.append(circle);
    } else {
      const path = createSvgElement("path");
      path.setAttribute("d", configuration.pathData ?? "");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--scada-grid-color, #334155)");
      path.setAttribute("stroke-width", "1");
      pattern.append(path);
    }
    this.#defs.append(pattern);
  }

  #renderCanvas(): void {
    if (this.#document === undefined || this.#background === undefined || this.#grid === undefined)
      return;
    const { canvas } = this.#document;
    const backgroundColor = this.#options.background ?? canvas.background;
    this.#background.setAttribute("x", "0");
    this.#background.setAttribute("y", "0");
    this.#background.setAttribute("width", String(this.#size.width));
    this.#background.setAttribute("height", String(this.#size.height));
    this.#background.setAttribute("fill", backgroundColor);
    this.#grid.replaceChildren();
    if (!this.#options.showGrid || !canvas.gridVisible) return;
    const rectangle = createSvgElement("rect");
    rectangle.setAttribute("x", "0");
    rectangle.setAttribute("y", "0");
    rectangle.setAttribute("width", String(canvas.width));
    rectangle.setAttribute("height", String(canvas.height));
    rectangle.setAttribute("fill", `url(#${this.#definitionPrefix}-grid)`);
    rectangle.setAttribute("transform", calculateViewportTransform(this.#viewport));
    rectangle.setAttribute("pointer-events", "none");
    this.#grid.append(rectangle);
  }

  #createLayer(layer: ScadaLayer): LayerElements {
    const existing = this.#layerElements.get(layer.id);
    if (existing !== undefined) {
      this.#updateLayer(layer);
      return existing;
    }
    const root = createSvgElement("g");
    const connections = createSvgElement("g");
    const nodes = createSvgElement("g");
    const ports = createSvgElement("g");
    connections.dataset.scadaConnections = "";
    nodes.dataset.scadaNodes = "";
    ports.dataset.scadaPorts = "";
    root.append(connections, nodes, ports);
    this.#layersElement?.append(root);
    const elements = { root, connections, nodes, ports };
    this.#layerElements.set(layer.id, elements);
    this.#updateLayer(layer);
    return elements;
  }

  #updateLayer(layer: ScadaLayer): void {
    const elements = this.#layerElements.get(layer.id) ?? this.#createLayer(layer);
    setDataAttributes(elements.root, {
      entityType: "layer",
      entityId: layer.id,
      layerId: layer.id,
      visible: String(layer.visible),
      locked: String(layer.locked)
    });
    elements.root.style.display = layer.visible ? "" : "none";
    elements.root.style.pointerEvents =
      this.#options.enablePointerEvents && !layer.locked ? "" : "none";
  }

  #reorderLayers(layers: readonly ScadaLayer[]): void {
    for (const layer of [...layers].sort((a, b) => a.order - b.order)) {
      const element = this.#layerElements.get(layer.id)?.root;
      if (element !== undefined) this.#layersElement?.append(element);
    }
  }

  #removeLayer(id: string): void {
    this.#layerElements.get(id)?.root.remove();
    this.#layerElements.delete(id);
  }

  #renderNode(node: ScadaNode): void {
    if (this.#document === undefined) return;
    const layer = this.#layerElements.get(node.layerId);
    if (layer === undefined) return;
    let group = this.#nodeElements.get(node.id);
    if (group === undefined) {
      group = createSvgElement("g");
      this.#nodeElements.set(node.id, group);
    }
    if (group.parentNode !== layer.nodes) layer.nodes.append(group);
    setDataAttributes(group, {
      entityType: "node",
      entityId: node.id,
      nodeId: node.id,
      layerId: node.layerId,
      symbolType: node.symbolType,
      visible: String(node.visible),
      locked: String(node.locked)
    });
    group.setAttribute("transform", createNodeTransform(node.transform));
    group.style.display = node.visible ? "" : "none";
    group.style.pointerEvents = this.#options.enablePointerEvents && !node.locked ? "" : "none";
    if (this.#options.showLockedState && node.locked) group.classList.add("scada-entity-locked");
    else group.classList.remove("scada-entity-locked");

    const state = this.#runtimeState?.getNodeState(node.id) ?? "normal";
    group.classList.remove(
      "scada-state-normal",
      "scada-state-running",
      "scada-state-stopped",
      "scada-state-warning",
      "scada-state-alarm",
      "scada-state-offline",
      "scada-state-disabled"
    );
    group.classList.add(runtimeStateClass(state));
    const context: SvgSymbolRenderContext = { document: this.#document, node, state };
    const renderer = this.#symbolRenderers.get(node.symbolType);
    if (renderer === undefined) {
      this.#emit("symbol-renderer-missing", { nodeId: node.id }, { symbolType: node.symbolType });
      this.#logger?.warn("Symbol renderer not found.", {
        nodeId: node.id,
        symbolType: node.symbolType
      });
    }
    let visual = group.querySelector<SVGGElement>(":scope > g[data-scada-symbol]");
    if (visual === null) {
      visual = (renderer ?? FALLBACK_SYMBOL_RENDERER).create(context);
      visual.dataset.scadaSymbol = "";
      group.append(visual);
    } else (renderer ?? FALLBACK_SYMBOL_RENDERER).update(visual, context);
    let title = group.querySelector<SVGTitleElement>(":scope > title");
    if (title === null) {
      title = createSvgElement("title");
      group.prepend(title);
    }
    title.textContent = node.name;
    this.#renderPorts(node, layer.ports);
    this.#renderDebugBounds(node);
  }

  #renderPorts(node: ScadaNode, container: SVGGElement): void {
    for (const [key, element] of this.#portElements)
      if (key.startsWith(`${node.id}::`)) {
        element.remove();
        this.#portElements.delete(key);
      }
    if (!this.#options.showPorts || this.#options.portVisibility === "never" || !node.visible)
      return;
    const definition = this.#symbols.get(node.symbolType);
    if (definition === undefined) return;
    for (const port of definition.ports) {
      const position = calculatePortPosition(node.transform, port.position);
      const element = this.#createPortElement(node, port, position);
      if (this.#options.portVisibility === "hover") {
        element.classList.add("scada-port-hover");
        element.style.opacity = "0";
      }
      container.append(element);
      this.#portElements.set(portKey(node.id, port.id), element);
    }
  }

  #createPortElement(node: ScadaNode, port: PortDefinition, position: Point): SVGElement {
    const circle = createSvgElement("circle");
    circle.setAttribute("cx", String(position.x));
    circle.setAttribute("cy", String(position.y));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "var(--scada-port-color, #38bdf8)");
    circle.setAttribute("stroke", "#e2e8f0");
    circle.setAttribute("stroke-width", "1.5");
    setDataAttributes(circle, {
      entityType: "port",
      entityId: portKey(node.id, port.id),
      nodeId: node.id,
      portId: port.id,
      layerId: node.layerId,
      direction: port.direction,
      medium: port.medium
    });
    return circle;
  }

  #renderConnection(connection: ScadaConnection): void {
    if (this.#document === undefined) return;
    const layer = this.#layerElements.get(connection.layerId);
    if (layer === undefined) return;
    const points = this.#resolveConnection(connection);
    const pathData = points === undefined ? "" : createPathData(points);
    let path = this.#connectionElements.get(connection.id);
    if (path === undefined) {
      path = createSvgElement("path");
      this.#connectionElements.set(connection.id, path);
    }
    if (path.parentNode !== layer.connections) layer.connections.append(path);
    this.#styleConnectionPath(path, connection, pathData, false);

    let hitArea = this.#connectionHitElements.get(connection.id);
    if (hitArea === undefined) {
      hitArea = createSvgElement("path");
      this.#connectionHitElements.set(connection.id, hitArea);
    }
    if (hitArea.parentNode !== layer.connections) layer.connections.append(hitArea);
    this.#styleConnectionPath(hitArea, connection, pathData, true);
  }

  #styleConnectionPath(
    path: SVGPathElement,
    connection: ScadaConnection,
    data: string,
    hitArea: boolean
  ): void {
    path.setAttribute("d", data);
    path.setAttribute("fill", "none");
    path.style.display = connection.visible ? "" : "none";
    setDataAttributes(path, {
      entityType: "connection",
      entityId: connection.id,
      connectionId: connection.id,
      layerId: connection.layerId,
      medium: connection.medium,
      visible: String(connection.visible),
      locked: String(connection.locked),
      hitArea: hitArea ? "true" : undefined
    });
    if (hitArea) {
      path.setAttribute("stroke", "transparent");
      path.setAttribute("stroke-width", String(this.#options.connectionHitAreaWidth));
      path.setAttribute(
        "pointer-events",
        this.#options.enablePointerEvents && !connection.locked ? "stroke" : "none"
      );
      return;
    }
    path.setAttribute("stroke", connection.style.stroke ?? "#38bdf8");
    path.setAttribute("stroke-width", String(connection.style.strokeWidth ?? 3));
    path.setAttribute("opacity", String(connection.style.opacity ?? 1));
    setOptionalAttribute(path, "stroke-dasharray", connection.style.dashPattern?.join(" "));
    path.setAttribute("stroke-linecap", connection.style.lineCap ?? "round");
    path.setAttribute("stroke-linejoin", connection.style.lineJoin ?? "round");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    const startArrow =
      connection.style.startMarker === "arrow" ||
      connection.direction === "reverse" ||
      connection.direction === "bidirectional";
    const endArrow =
      connection.style.endMarker === "arrow" ||
      connection.direction === "forward" ||
      connection.direction === "bidirectional";
    setOptionalAttribute(
      path,
      "marker-start",
      startArrow ? `url(#${this.#definitionPrefix}-arrow-start)` : undefined
    );
    setOptionalAttribute(
      path,
      "marker-end",
      endArrow ? `url(#${this.#definitionPrefix}-arrow-end)` : undefined
    );
    path.classList.add(`scada-medium-${connection.medium.replaceAll(/[^a-zA-Z0-9-]/g, "-")}`);
  }

  #resolveConnection(connection: ScadaConnection): readonly Point[] | undefined {
    if (this.#document === undefined) return undefined;
    const source = this.#resolveEndpoint(connection.source.nodeId, connection.source.portId);
    const target = this.#resolveEndpoint(connection.target.nodeId, connection.target.portId);
    if (source === undefined || target === undefined) {
      this.#logger?.warn("Connection endpoint could not be resolved.", {
        connectionId: connection.id
      });
      return undefined;
    }
    return resolveConnectionPoints(connection, source, target);
  }

  #resolveEndpoint(nodeId: string, portId: string): Point | undefined {
    const node = this.#document?.nodes.find(({ id }) => id === nodeId);
    if (node === undefined) return undefined;
    const port = this.#symbols.get(node.symbolType)?.ports.find(({ id }) => id === portId);
    return port === undefined ? undefined : calculatePortPosition(node.transform, port.position);
  }

  #removeNode(id: string): void {
    this.#nodeElements.get(id)?.remove();
    this.#nodeElements.delete(id);
    for (const [key, element] of this.#portElements)
      if (key.startsWith(`${id}::`)) {
        element.remove();
        this.#portElements.delete(key);
      }
  }

  #removeConnection(id: string): void {
    this.#connectionElements.get(id)?.remove();
    this.#connectionHitElements.get(id)?.remove();
    this.#connectionElements.delete(id);
    this.#connectionHitElements.delete(id);
  }

  #renderDebugBounds(node: ScadaNode): void {
    if (this.#debug === undefined) return;
    this.#debug.querySelector(`[data-debug-node-id="${CSS.escape(node.id)}"]`)?.remove();
    if (!this.#options.showDebugBounds) return;
    const rectangle = createSvgElement("rect");
    rectangle.dataset.debugNodeId = node.id;
    rectangle.setAttribute("x", String(node.transform.x));
    rectangle.setAttribute("y", String(node.transform.y));
    rectangle.setAttribute("width", String(node.transform.width));
    rectangle.setAttribute("height", String(node.transform.height));
    rectangle.setAttribute("fill", "none");
    rectangle.setAttribute("stroke", "#f43f5e");
    rectangle.setAttribute("stroke-dasharray", "3 3");
    rectangle.setAttribute("pointer-events", "none");
    this.#debug.append(rectangle);
  }

  #applyViewport(): void {
    this.#viewportElement?.setAttribute("transform", calculateViewportTransform(this.#viewport));
    this.#renderCanvas();
  }

  #installDelegatedListeners(): void {
    if (this.#svg === undefined || !this.#options.enablePointerEvents) return;
    for (const [domType, eventType] of [
      ["pointerover", "entity-pointer-enter"],
      ["pointerout", "entity-pointer-leave"],
      ["pointerdown", "entity-pointer-down"]
    ] as const) {
      const listener: EventListener = (event) => {
        const metadata = resolveEntityMetadata(event.target);
        if (metadata.entityType !== undefined) {
          if (
            this.#options.portVisibility === "hover" &&
            metadata.entityType === "node" &&
            metadata.nodeId !== undefined
          )
            this.#setNodePortHover(metadata.nodeId, domType !== "pointerout");
          this.#emit(eventType, metadata);
        }
      };
      this.#svg.addEventListener(domType, listener);
      this.#listeners.push({ type: domType, listener });
    }
  }

  #setNodePortHover(nodeId: string, visible: boolean): void {
    for (const [key, element] of this.#portElements)
      if (key.startsWith(`${nodeId}::`)) element.style.opacity = visible ? "1" : "0";
  }

  #emit(
    type: RendererEventType,
    metadata: EntityPointerMetadata = {},
    context: Readonly<Record<string, JsonValue>> = EMPTY_CONTEXT
  ): void {
    this.#onEvent?.({ type, timestamp: new Date().toISOString(), metadata, context });
  }

  #clearEntityMaps(): void {
    this.#nodeElements.clear();
    this.#connectionElements.clear();
    this.#connectionHitElements.clear();
    this.#layerElements.clear();
    this.#portElements.clear();
  }

  #cancelScheduledFrame(): void {
    if (this.#pendingFrame !== undefined) cancelAnimationFrame(this.#pendingFrame);
    this.#pendingFrame = undefined;
    this.#pendingDocument = undefined;
    this.#pendingChanges = undefined;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new RendererError("RENDERER_DISPOSED", "Renderer has been disposed.");
  }

  #assertMounted(): void {
    this.#assertUsable();
    if (this.#svg === undefined)
      throw new RendererError("RENDERER_NOT_MOUNTED", "Renderer is not mounted.");
  }
}

export function createSvgRenderer(dependencies: SvgRendererDependencies): SvgRenderer {
  return new NativeSvgRenderer(dependencies);
}

export function createEmptyRenderChangeSet(): RenderChangeSet {
  return { ...createEmptyChangeSet(), viewportChanged: false, symbolRegistryChanged: false };
}
