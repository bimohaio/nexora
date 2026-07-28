import {
  UlidEntityIdGenerator,
  mergeChangeSets,
  type DocumentChangeSet,
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
  normalizeDocumentChangeSet,
  resolveConnectionPoints,
  zoomViewportAtPoint
} from "./calculations.js";
import {
  DEFAULT_RENDERER_OPTIONS,
  type EntityPointerMetadata,
  type RendererEventType,
  type RendererOptions,
  type RendererRuntimeChangeSet,
  type RendererRuntimeSnapshot,
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

function validateRendererOptions(options: RendererOptions): void {
  const validGridPattern = ["lines", "dots", "cross"].includes(options.gridPattern);
  const validPortVisibility = ["always", "hover", "never"].includes(options.portVisibility);
  if (
    !validGridPattern ||
    !validPortVisibility ||
    !Number.isFinite(options.connectionHitAreaWidth) ||
    options.connectionHitAreaWidth <= 0 ||
    !Number.isFinite(options.minZoom) ||
    options.minZoom <= 0 ||
    !Number.isFinite(options.maxZoom) ||
    options.maxZoom < options.minZoom ||
    (options.gridSize !== undefined &&
      (!Number.isFinite(options.gridSize) || options.gridSize <= 0)) ||
    options.ariaLabel.trim() === ""
  )
    throw new RendererError("RENDER_OPTIONS_INVALID", "Renderer options are invalid.");
}

function findDirectSymbolVisual(group: SVGGElement): SVGGElement | undefined {
  return Array.from(group.children).find(
    (child): child is SVGGElement =>
      child.tagName.toLowerCase() === "g" && child.hasAttribute("data-scada-symbol")
  );
}

function findDirectTitle(group: SVGGElement): SVGTitleElement | undefined {
  return Array.from(group.children).find(
    (child): child is SVGTitleElement => child.tagName.toLowerCase() === "title"
  );
}

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
  #pendingChanges: DocumentChangeSet | undefined;
  #runtimeSnapshot: RendererRuntimeSnapshot | undefined;
  #lastAppliedRuntimeRevision: number | undefined;

  public constructor(dependencies: SvgRendererDependencies) {
    this.#symbols = dependencies.symbols;
    this.#symbolRenderers =
      dependencies.symbolRenderers ?? createInitialSvgSymbolRendererRegistry();
    this.#onEvent = dependencies.onEvent;
    this.#logger = dependencies.logger;
    this.#runtimeState = dependencies.runtimeState;
    this.#options = { ...DEFAULT_RENDERER_OPTIONS, ...dependencies.options };
    validateRendererOptions(this.#options);
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
    this.#disposeAllSymbolVisuals();
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
      this.#disposeAllSymbolVisuals();
      this.#document = document;
      this.#lastAppliedRuntimeRevision = undefined;
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

  public renderChanges(
    document: Readonly<ScadaDocument>,
    changes: Readonly<DocumentChangeSet>
  ): void {
    this.#assertMounted();
    if (this.#document === undefined) {
      this.renderDocument(document);
      return;
    }
    const previousDocument = this.#document;
    const normalized = normalizeDocumentChangeSet(changes);
    this.#document = document;
    if (normalized.canvasChanged) {
      this.#renderDefinitions();
      this.#renderCanvas();
    }
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
    const invalidatedNodeIds = new Set([...changedNodeIds, ...normalized.removedNodeIds]);
    for (const id of changedNodeIds) {
      const node = document.nodes.find(({ id: candidate }) => candidate === id);
      if (node !== undefined) this.#renderNode(node);
    }
    const affectedConnectionIds = new Set([
      ...normalized.addedConnectionIds,
      ...normalized.updatedConnectionIds
    ]);
    for (const connection of [...previousDocument.connections, ...document.connections])
      if (
        invalidatedNodeIds.has(connection.source.nodeId) ||
        invalidatedNodeIds.has(connection.target.nodeId)
      )
        affectedConnectionIds.add(connection.id);
    for (const id of affectedConnectionIds) {
      const connection = document.connections.find(({ id: candidate }) => candidate === id);
      if (connection === undefined) this.#removeConnection(id);
      else this.#renderConnection(connection);
    }
    this.#reorderLayerEntities(document);
    this.#emit(
      "render-completed",
      {},
      {
        nodeCount: changedNodeIds.size,
        connectionCount: affectedConnectionIds.size
      }
    );
  }

  public scheduleRenderChanges(
    document: Readonly<ScadaDocument>,
    changes: Readonly<DocumentChangeSet>
  ): void {
    this.#assertMounted();
    this.#pendingDocument = document;
    this.#pendingChanges =
      this.#pendingChanges === undefined ? changes : mergeChangeSets(this.#pendingChanges, changes);
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
    const nextOptions = { ...this.#options, ...options };
    validateRendererOptions(nextOptions);
    this.#options = nextOptions;
    if (this.#svg !== undefined) {
      this.#svg.setAttribute("aria-label", this.#options.ariaLabel);
      if (this.#document !== undefined) {
        this.#renderDefinitions();
        this.#renderCanvas();
        for (const node of this.#document.nodes) this.#renderNode(node);
      }
    }
  }

  public refreshRuntimeStates(
    nodeIds?: readonly string[],
    connectionIds?: readonly string[]
  ): void {
    if (this.#document === undefined) return;
    const requestedNodes = nodeIds === undefined ? undefined : new Set(nodeIds);
    const requestedConnections = connectionIds === undefined ? undefined : new Set(connectionIds);
    for (const node of this.#document.nodes) {
      if (requestedNodes === undefined || requestedNodes.has(node.id))
        try {
          this.#renderNode(node, true);
        } catch (error) {
          this.#emit(
            "render-failed",
            { nodeId: node.id },
            {
              operation: "runtime-node-update",
              message: error instanceof Error ? error.message : "Runtime node update failed."
            }
          );
          this.#logger?.error("Runtime node update failed.", { nodeId: node.id });
        }
    }
    if (connectionIds !== undefined)
      for (const connection of this.#document.connections)
        if (requestedConnections?.has(connection.id))
          try {
            this.#renderConnection(connection);
          } catch (error) {
            this.#emit(
              "render-failed",
              { connectionId: connection.id },
              {
                operation: "runtime-connection-update",
                message:
                  error instanceof Error ? error.message : "Runtime connection update failed."
              }
            );
            this.#logger?.error("Runtime connection update failed.", {
              connectionId: connection.id
            });
          }
  }

  public renderRuntimeChanges(
    snapshot: RendererRuntimeSnapshot,
    diff: RendererRuntimeChangeSet
  ): void {
    this.#assertUsable();
    if (this.#document === undefined) return;
    if (
      this.#lastAppliedRuntimeRevision !== undefined &&
      snapshot.revision <= this.#lastAppliedRuntimeRevision
    )
      return;
    const continuous =
      diff.toRevision === snapshot.revision &&
      (this.#lastAppliedRuntimeRevision === undefined
        ? diff.fromRevision === 0
        : diff.fromRevision === this.#lastAppliedRuntimeRevision);
    this.#runtimeSnapshot = snapshot;
    this.#lastAppliedRuntimeRevision = snapshot.revision;
    if (!continuous || diff.reset) {
      this.refreshRuntimeStates(
        this.#document.nodes.map(({ id }) => id),
        this.#document.connections.map(({ id }) => id)
      );
      return;
    }
    this.refreshRuntimeStates(
      [...diff.addedNodeIds, ...diff.updatedNodeIds, ...diff.removedNodeIds],
      [...diff.addedConnectionIds, ...diff.updatedConnectionIds, ...diff.removedConnectionIds]
    );
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
    this.#runtimeSnapshot = undefined;
    this.#lastAppliedRuntimeRevision = undefined;
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
    pattern.setAttribute("patternTransform", calculateViewportTransform(this.#viewport));
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
    this.#defs
      ?.querySelector<SVGPatternElement>(`#${this.#definitionPrefix}-grid`)
      ?.setAttribute("patternTransform", calculateViewportTransform(this.#viewport));
    const rectangle = createSvgElement("rect");
    rectangle.setAttribute("x", "0");
    rectangle.setAttribute("y", "0");
    rectangle.setAttribute("width", String(this.#size.width));
    rectangle.setAttribute("height", String(this.#size.height));
    rectangle.setAttribute("fill", `url(#${this.#definitionPrefix}-grid)`);
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
    const root = this.#layerElements.get(id)?.root;
    if (root !== undefined) {
      for (const [nodeId, element] of this.#nodeElements)
        if (root.contains(element)) this.#nodeElements.delete(nodeId);
      for (const [connectionId, element] of this.#connectionElements)
        if (root.contains(element)) {
          this.#connectionElements.delete(connectionId);
          this.#connectionHitElements.delete(connectionId);
        }
      for (const [key, element] of this.#portElements)
        if (root.contains(element)) this.#portElements.delete(key);
      root.remove();
    }
    this.#layerElements.delete(id);
  }

  #reorderLayerEntities(document: Readonly<ScadaDocument>): void {
    const portsByNode = new Map<string, SVGElement[]>();
    for (const port of this.#portElements.values()) {
      const nodeId = port.dataset.nodeId;
      if (nodeId === undefined) continue;
      const ports = portsByNode.get(nodeId) ?? [];
      ports.push(port);
      portsByNode.set(nodeId, ports);
    }
    for (const connection of document.connections) {
      const container = this.#layerElements.get(connection.layerId)?.connections;
      const path = this.#connectionElements.get(connection.id);
      const hitArea = this.#connectionHitElements.get(connection.id);
      if (path !== undefined) container?.append(path);
      if (hitArea !== undefined) container?.append(hitArea);
    }
    for (const node of document.nodes) {
      const elements = this.#layerElements.get(node.layerId);
      const visual = this.#nodeElements.get(node.id);
      if (visual !== undefined) elements?.nodes.append(visual);
      for (const port of portsByNode.get(node.id) ?? []) elements?.ports.append(port);
    }
  }

  #renderNode(node: ScadaNode, runtimeOnly = false): void {
    if (this.#document === undefined) return;
    const runtimeState = this.#runtimeSnapshot ?? this.#runtimeState;
    const resolvedVisualState = runtimeState?.getNodeVisualState?.(node.id);
    const runtimeProperties =
      resolvedVisualState?.properties ?? runtimeState?.getNodeProperties?.(node.id);
    const runtimeVisibility =
      resolvedVisualState?.visible ?? runtimeState?.getNodeVisibility?.(node.id);
    const resolvedNode: ScadaNode = {
      ...node,
      properties:
        runtimeProperties === undefined
          ? node.properties
          : { ...node.properties, ...runtimeProperties },
      visible: runtimeVisibility ?? node.visible
    };
    const layer = this.#layerElements.get(resolvedNode.layerId);
    if (layer === undefined) return;
    let group = this.#nodeElements.get(resolvedNode.id);
    if (group === undefined) {
      group = createSvgElement("g");
      this.#nodeElements.set(resolvedNode.id, group);
    }
    if (group.parentNode !== layer.nodes) layer.nodes.append(group);
    setDataAttributes(group, {
      entityType: "node",
      entityId: resolvedNode.id,
      nodeId: resolvedNode.id,
      layerId: resolvedNode.layerId,
      symbolType: resolvedNode.symbolType,
      visible: String(resolvedNode.visible),
      locked: String(resolvedNode.locked)
    });
    group.setAttribute("transform", createNodeTransform(resolvedNode.transform));
    group.style.display = resolvedNode.visible ? "" : "none";
    group.style.pointerEvents =
      this.#options.enablePointerEvents && !resolvedNode.locked ? "" : "none";
    if (this.#options.showLockedState && resolvedNode.locked)
      group.classList.add("scada-entity-locked");
    else group.classList.remove("scada-entity-locked");

    const state =
      resolvedVisualState?.effectiveState ??
      runtimeState?.getNodeState(resolvedNode.id) ??
      "normal";
    group.classList.remove(
      "scada-state-normal",
      "scada-state-active",
      "scada-state-inactive",
      "scada-state-running",
      "scada-state-stopped",
      "scada-state-warning",
      "scada-state-alarm",
      "scada-state-offline",
      "scada-state-disabled"
    );
    group.classList.add(runtimeStateClass(state));
    const context: SvgSymbolRenderContext = {
      document: this.#document,
      node: resolvedNode,
      state,
      ...(resolvedVisualState === undefined ? {} : { visualState: resolvedVisualState })
    };
    const metadata = this.#symbols.get(resolvedNode.symbolType);
    if (metadata === undefined) {
      this.#emit(
        "symbol-metadata-missing",
        { nodeId: resolvedNode.id },
        { symbolType: resolvedNode.symbolType }
      );
      this.#logger?.warn("Symbol metadata not found.", {
        nodeId: resolvedNode.id,
        symbolType: resolvedNode.symbolType
      });
    }
    const visualType = metadata?.type ?? resolvedNode.symbolType;
    const renderer = this.#symbolRenderers.get(visualType);
    if (renderer === undefined) {
      this.#emit(
        "symbol-renderer-missing",
        { nodeId: resolvedNode.id },
        { symbolType: resolvedNode.symbolType }
      );
      this.#logger?.warn("Symbol renderer not found.", {
        nodeId: resolvedNode.id,
        symbolType: resolvedNode.symbolType
      });
    }
    const rendererKey = renderer === undefined ? "__fallback__" : visualType;
    let visual = findDirectSymbolVisual(group);
    if (visual !== undefined && visual.dataset.scadaRendererType !== rendererKey) {
      this.#disposeSymbolVisual(visual);
      visual.remove();
      visual = undefined;
    }
    if (visual === undefined) {
      visual = (renderer ?? FALLBACK_SYMBOL_RENDERER).create(context);
      visual.dataset.scadaSymbol = "";
      visual.dataset.scadaRendererType = rendererKey;
      group.append(visual);
    } else {
      const symbolRenderer = renderer ?? FALLBACK_SYMBOL_RENDERER;
      if (runtimeOnly)
        (symbolRenderer.updateRuntime ?? symbolRenderer.update).call(
          symbolRenderer,
          visual,
          context
        );
      else
        (symbolRenderer.updateDesign ?? symbolRenderer.update).call(
          symbolRenderer,
          visual,
          context
        );
    }
    let title = findDirectTitle(group);
    if (title === undefined) {
      title = createSvgElement("title");
      group.prepend(title);
    }
    title.textContent = resolvedNode.name;
    this.#renderPorts(resolvedNode, layer.ports);
    this.#renderDebugBounds(resolvedNode);
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
    const runtimeState = this.#runtimeSnapshot ?? this.#runtimeState;
    const runtimeStyle = runtimeState?.getConnectionStyle?.(connection.id);
    const runtimeVisibility = runtimeState?.getConnectionVisibility?.(connection.id);
    const resolvedConnection: ScadaConnection = {
      ...connection,
      style:
        runtimeStyle === undefined ? connection.style : { ...connection.style, ...runtimeStyle },
      visible: runtimeVisibility ?? connection.visible
    };
    const layer = this.#layerElements.get(resolvedConnection.layerId);
    if (layer === undefined) return;
    const points = this.#resolveConnection(resolvedConnection);
    const pathData = points === undefined ? "" : createPathData(points);
    let path = this.#connectionElements.get(resolvedConnection.id);
    if (path === undefined) {
      path = createSvgElement("path");
      this.#connectionElements.set(resolvedConnection.id, path);
    }
    if (path.parentNode !== layer.connections) layer.connections.append(path);
    this.#styleConnectionPath(path, resolvedConnection, pathData, false);

    let hitArea = this.#connectionHitElements.get(resolvedConnection.id);
    if (hitArea === undefined) {
      hitArea = createSvgElement("path");
      this.#connectionHitElements.set(resolvedConnection.id, hitArea);
    }
    if (hitArea.parentNode !== layer.connections) layer.connections.append(hitArea);
    this.#styleConnectionPath(hitArea, resolvedConnection, pathData, true);
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
    const node = this.#nodeElements.get(id);
    const visual = node === undefined ? undefined : findDirectSymbolVisual(node);
    if (visual !== undefined) this.#disposeSymbolVisual(visual);
    this.#nodeElements.get(id)?.remove();
    this.#nodeElements.delete(id);
    this.#debug?.querySelector(`[data-debug-node-id="${CSS.escape(id)}"]`)?.remove();
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

  #disposeSymbolVisual(visual: SVGGElement): void {
    const rendererType = visual.dataset.scadaRendererType;
    const renderer =
      rendererType === undefined || rendererType === "__fallback__"
        ? FALLBACK_SYMBOL_RENDERER
        : this.#symbolRenderers.get(rendererType);
    renderer?.dispose?.(visual);
  }

  #disposeAllSymbolVisuals(): void {
    for (const node of this.#nodeElements.values()) {
      const visual = findDirectSymbolVisual(node);
      if (visual !== undefined) this.#disposeSymbolVisual(visual);
    }
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
