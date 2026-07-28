import {
  SystemClock,
  UlidEntityIdGenerator,
  type Clock,
  type Command,
  type DomainEvent,
  type EntityIdGenerator,
  type ScadaConnection,
  type ScadaDocument,
  type ScadaNode
} from "@web-scada/core";
import {
  alignRectangles,
  calculatePortPosition,
  distributeRectangles,
  normalizeRoute,
  projectPointToSegment,
  rectangleToBounds,
  rotateTransforms,
  rotatedBounds,
  unionBounds,
  viewportPointToCanvas,
  type Point,
  type Rectangle,
  type Size,
  type Viewport
} from "@web-scada/geometry";
import type { SymbolRegistry } from "@web-scada/symbols";
import { deriveDocumentChangeSet } from "./change-set.js";
import {
  DeleteEntitiesCommand,
  AtomicDocumentCommand,
  InsertConnectionCommand,
  InsertFragmentCommand,
  InsertNodeCommand,
  MoveNodesCommand,
  ReorderNodesCommand,
  ResizeNodeCommand,
  UpdateNodeCommand,
  type DesignerCommandDependencies
} from "./commands.js";
import type {
  AlignmentGuide,
  ClipboardAdapter,
  DesignerClipboardFragment,
  DesignerController,
  DesignerInteraction,
  DesignerOptions,
  DesignerRenderAdapter,
  DesignerRuntimeState,
  DesignerState,
  DesignerStateEvent,
  DesignerStateListener,
  DesignerToolId,
  HoverState,
  ConnectionEndpointName,
  DistributionAxis,
  NodeOrderOperation,
  ResizeHandle,
  SelectionMode,
  SelectionState
} from "./contracts.js";
import type { Alignment } from "@web-scada/geometry";
import { CommandHistory } from "./history.js";
import {
  EMPTY_SELECTION,
  selectConnection,
  selectNode,
  selectNodesInRectangle
} from "./selection.js";
import { snapNodeDelta } from "./snap.js";

const DEFAULT_OPTIONS: DesignerOptions = {
  snap: {
    enabled: true,
    grid: true,
    alignment: true,
    ports: true,
    boundingBoxes: true,
    threshold: 6
  },
  pasteOffset: { x: 20, y: 20 }
};

class MemoryClipboardAdapter implements ClipboardAdapter {
  #content = "";

  public write(documentFragment: string): Promise<void> {
    this.#content = documentFragment;
    return Promise.resolve();
  }

  public read(): Promise<string> {
    return Promise.resolve(this.#content);
  }
}

export interface CreateDesignerEngineOptions {
  readonly document: ScadaDocument;
  readonly symbols: SymbolRegistry;
  readonly renderer?: DesignerRenderAdapter;
  readonly clipboard?: ClipboardAdapter;
  readonly idGenerator?: EntityIdGenerator;
  readonly clock?: Clock;
  readonly options?: Partial<DesignerOptions>;
}

function selectionMode(additive: boolean, toggle: boolean): SelectionMode {
  return toggle ? "toggle" : additive ? "add" : "replace";
}

export function resizeTransform(
  node: ScadaNode,
  handle: ResizeHandle,
  delta: Point,
  minimum: Size
): ScadaNode["transform"] {
  const transform = node.transform;
  let x = transform.x;
  let y = transform.y;
  let width = transform.width;
  let height = transform.height;
  if (handle.includes("e")) width += delta.x;
  if (handle.includes("s")) height += delta.y;
  if (handle.includes("w")) {
    x += delta.x;
    width -= delta.x;
  }
  if (handle.includes("n")) {
    y += delta.y;
    height -= delta.y;
  }
  if (width < minimum.width) {
    if (handle.includes("w")) x -= minimum.width - width;
    width = minimum.width;
  }
  if (height < minimum.height) {
    if (handle.includes("n")) y -= minimum.height - height;
    height = minimum.height;
  }
  return { ...transform, x, y, width, height };
}

function parseClipboardFragment(value: string): DesignerClipboardFragment | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("nodes" in parsed) ||
      !Array.isArray(parsed.nodes) ||
      !("connections" in parsed) ||
      !Array.isArray(parsed.connections)
    )
      return undefined;
    return parsed as unknown as DesignerClipboardFragment;
  } catch {
    return undefined;
  }
}

export class NativeDesignerEngine implements DesignerController {
  readonly #symbols: SymbolRegistry;
  readonly #renderer: DesignerRenderAdapter | undefined;
  readonly #clipboard: ClipboardAdapter;
  readonly #ids: EntityIdGenerator;
  readonly #clock: Clock;
  readonly #commandDependencies: DesignerCommandDependencies;
  readonly #history = new CommandHistory();
  readonly #stateListeners = new Set<DesignerStateListener>();
  readonly #domainListeners = new Set<(event: DomainEvent) => void>();
  readonly #options: DesignerOptions;
  #document: ScadaDocument;
  #selection: SelectionState = EMPTY_SELECTION;
  #viewport: Viewport;
  #activeTool: DesignerToolId = "select";
  #hover: HoverState = {};
  #interaction: DesignerInteraction = { type: "idle" };
  #guides: readonly AlignmentGuide[] = [];
  #disposed = false;

  public constructor(options: CreateDesignerEngineOptions) {
    this.#document = options.document;
    this.#symbols = options.symbols;
    this.#renderer = options.renderer;
    this.#clipboard = options.clipboard ?? new MemoryClipboardAdapter();
    this.#ids = options.idGenerator ?? new UlidEntityIdGenerator();
    this.#clock = options.clock ?? new SystemClock();
    this.#commandDependencies = {
      clock: this.#clock,
      idGenerator: this.#ids,
      symbolRegistry: this.#symbols
    };
    this.#options = {
      ...DEFAULT_OPTIONS,
      ...options.options,
      snap: { ...DEFAULT_OPTIONS.snap, ...options.options?.snap }
    };
    this.#viewport = options.document.canvas.defaultViewport;
    this.#renderer?.renderDocument(options.document);
    this.#renderer?.setViewport(this.#viewport);
  }

  public getState(): DesignerState {
    return {
      document: this.#document,
      selection: this.#selection,
      viewport: this.#viewport
    };
  }

  public getRuntimeState(): DesignerRuntimeState {
    return {
      ...this.getState(),
      activeTool: this.#activeTool,
      hover: this.#hover,
      interaction: this.#interaction,
      guides: this.#guides,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo
    };
  }

  public execute(command: Command): void {
    this.#assertUsable();
    const previous = this.#document;
    const next = this.#history.execute(command, previous);
    this.#commitDocument(previous, next);
  }

  public undo(): void {
    const previous = this.#document;
    this.#commitDocument(previous, this.#history.undo(previous));
  }

  public redo(): void {
    const previous = this.#document;
    this.#commitDocument(previous, this.#history.redo(previous));
  }

  public setSelection(selection: SelectionState): void {
    const nodeIds = new Set(this.#document.nodes.map(({ id }) => id));
    const connectionIds = new Set(this.#document.connections.map(({ id }) => id));
    this.#selection = {
      selectedNodeIds: [
        ...new Set(selection.selectedNodeIds.filter((id) => nodeIds.has(id)))
      ].sort(),
      selectedConnectionIds: [
        ...new Set(selection.selectedConnectionIds.filter((id) => connectionIds.has(id)))
      ].sort()
    };
    this.#emitState("selection-changed");
  }

  public selectNode(nodeId: string, mode: SelectionMode = "replace"): void {
    this.setSelection(selectNode(this.#selection, nodeId, mode));
  }

  public selectConnection(connectionId: string, mode: SelectionMode = "replace"): void {
    this.setSelection(selectConnection(this.#selection, connectionId, mode));
  }

  public selectAll(): void {
    this.setSelection({
      selectedNodeIds: this.#document.nodes.filter(({ visible }) => visible).map(({ id }) => id),
      selectedConnectionIds: this.#document.connections
        .filter(({ visible }) => visible)
        .map(({ id }) => id)
    });
  }

  public clearSelection(): void {
    this.setSelection(EMPTY_SELECTION);
  }

  public selectMarquee(bounds: Rectangle, mode: SelectionMode = "replace"): void {
    this.setSelection(selectNodesInRectangle(this.#document, this.#selection, bounds, mode));
  }

  public moveSelection(delta: Point): void {
    const nodes = this.#editableSelectedNodes(true);
    const firstNode = nodes[0];
    if (firstNode === undefined) return;
    const snapped = snapNodeDelta(this.#document, nodes, delta, this.#options.snap);
    this.setGuides(snapped.guides);
    this.execute(
      new MoveNodesCommand(
        nodes.map(({ id }) => id),
        snapped.delta,
        this.#commandDependencies
      )
    );
    this.setGuides([]);
  }

  public resizeNode(nodeId: string, handle: ResizeHandle, delta: Point): void {
    const node = this.#document.nodes.find(({ id }) => id === nodeId);
    if (node === undefined || node.locked || !node.visible) return;
    const definition = this.#symbols.get(node.symbolType);
    const minimum = {
      width: definition?.minimumWidth ?? 10,
      height: definition?.minimumHeight ?? 10
    };
    this.execute(
      new ResizeNodeCommand(
        nodeId,
        resizeTransform(node, handle, delta, minimum),
        this.#commandDependencies
      )
    );
  }

  public resizeSelection(handle: ResizeHandle, delta: Point, preserveAspectRatio = false): void {
    const nodes = this.#editableSelectedNodes(true);
    const firstNode = nodes[0];
    if (firstNode === undefined) return;
    const bounds = this.#nodeBounds(nodes);
    if (bounds === undefined) return;
    let target = resizeTransform(
      {
        ...firstNode,
        transform: { ...firstNode.transform, ...bounds }
      },
      handle,
      delta,
      { width: 1, height: 1 }
    );
    if (preserveAspectRatio) {
      const scale = Math.min(target.width / bounds.width, target.height / bounds.height);
      target = { ...target, width: bounds.width * scale, height: bounds.height * scale };
    }
    const scaleX = target.width / bounds.width;
    const scaleY = target.height / bounds.height;
    const selected = new Set(nodes.map(({ id }) => id));
    this.#executeAtomic("resize-node", (document) => ({
      ...document,
      nodes: document.nodes.map((node) =>
        selected.has(node.id)
          ? {
              ...node,
              transform: {
                ...node.transform,
                x: target.x + (node.transform.x - bounds.x) * scaleX,
                y: target.y + (node.transform.y - bounds.y) * scaleY,
                width: Math.max(
                  this.#symbols.get(node.symbolType)?.minimumWidth ?? 1,
                  node.transform.width * scaleX
                ),
                height: Math.max(
                  this.#symbols.get(node.symbolType)?.minimumHeight ?? 1,
                  node.transform.height * scaleY
                )
              }
            }
          : node
      )
    }));
  }

  public rotateSelection(angleDelta: number, snap = true): void {
    const nodes = this.#editableSelectedNodes(true);
    if (nodes.length === 0 || !Number.isFinite(angleDelta)) return;
    const applied = snap ? Math.round(angleDelta / 15) * 15 : angleDelta;
    const transforms = rotateTransforms(
      nodes.map(({ transform }) => transform),
      applied
    );
    const byId = new Map(nodes.map((node, index) => [node.id, transforms[index]]));
    this.#executeAtomic("rotate-node", (document) => ({
      ...document,
      nodes: document.nodes.map((node) => {
        const transform = byId.get(node.id);
        return transform === undefined ? node : { ...node, transform };
      })
    }));
  }

  public alignSelection(alignment: Alignment, referenceNodeId?: string): void {
    const nodes = this.#editableSelectedNodes(false);
    if (nodes.length < 2) return;
    const rectangles = nodes.map(({ transform }) => rotatedBounds(transform));
    const referenceNode = nodes.find(({ id }) => id === referenceNodeId);
    const positions = alignRectangles(
      rectangles,
      alignment,
      referenceNode === undefined ? undefined : rotatedBounds(referenceNode.transform)
    );
    const deltas = new Map(
      nodes.flatMap((node, index) => {
        const rectangle = rectangles[index];
        const position = positions[index];
        return rectangle === undefined || position === undefined
          ? []
          : [[node.id, { x: position.x - rectangle.x, y: position.y - rectangle.y }] as const];
      })
    );
    this.#transformPositions(deltas);
  }

  public distributeSelection(axis: DistributionAxis): void {
    const nodes = this.#editableSelectedNodes(false);
    if (nodes.length < 3) return;
    const rectangles = nodes.map(({ transform }) => rotatedBounds(transform));
    const result = distributeRectangles(rectangles, axis);
    const deltas = new Map(
      nodes.flatMap((node, index) => {
        const rectangle = rectangles[index];
        const position = result.positions[index];
        return rectangle === undefined || position === undefined
          ? []
          : [[node.id, { x: position.x - rectangle.x, y: position.y - rectangle.y }] as const];
      })
    );
    this.#transformPositions(deltas);
  }

  public groupSelection(): void {
    const nodes = this.#editableSelectedNodes(false).filter(
      ({ parentId }) => parentId === undefined
    );
    if (nodes.length < 2 || new Set(nodes.map(({ layerId }) => layerId)).size !== 1) return;
    const parent = nodes[0];
    if (parent === undefined) return;
    const children = new Set(nodes.slice(1).map(({ id }) => id));
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === parent.id
          ? {
              ...node,
              metadata: { ...node.metadata, designerGroup: true }
            }
          : children.has(node.id)
            ? { ...node, parentId: parent.id }
            : node
      )
    }));
    this.selectNode(parent.id);
  }

  public ungroupSelection(): void {
    const groups = new Set(
      this.#document.nodes
        .filter(
          ({ id, metadata }) =>
            this.#selection.selectedNodeIds.includes(id) && metadata?.designerGroup === true
        )
        .map(({ id }) => id)
    );
    if (groups.size === 0) return;
    const childIds = this.#document.nodes
      .filter(({ parentId }) => parentId !== undefined && groups.has(parentId))
      .map(({ id }) => id);
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      nodes: document.nodes.map((node) => {
        if (groups.has(node.id)) {
          const metadata = { ...node.metadata };
          delete metadata.designerGroup;
          return { ...node, metadata };
        }
        if (node.parentId !== undefined && groups.has(node.parentId)) {
          const { parentId: _parentId, ...withoutParent } = node;
          void _parentId;
          return withoutParent;
        }
        return node;
      })
    }));
    this.setSelection({
      selectedNodeIds: [...groups, ...childIds],
      selectedConnectionIds: []
    });
  }

  public nudgeSelection(delta: Point): void {
    const nodes = this.#editableSelectedNodes(true);
    if (nodes.length === 0) return;
    this.execute(
      new MoveNodesCommand(
        nodes.map(({ id }) => id),
        delta,
        this.#commandDependencies
      )
    );
  }

  public setSelectionLocked(locked: boolean): void {
    const selectedNodes = new Set(this.#selection.selectedNodeIds);
    const selectedConnections = new Set(this.#selection.selectedConnectionIds);
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      nodes: document.nodes.map((node) =>
        selectedNodes.has(node.id) ? { ...node, locked } : node
      ),
      connections: document.connections.map((connection) =>
        selectedConnections.has(connection.id) ? { ...connection, locked } : connection
      )
    }));
  }

  public setSelectionVisible(visible: boolean): void {
    const selectedNodes = new Set(this.#selection.selectedNodeIds);
    const selectedConnections = new Set(this.#selection.selectedConnectionIds);
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      nodes: document.nodes.map((node) =>
        selectedNodes.has(node.id) ? { ...node, visible } : node
      ),
      connections: document.connections.map((connection) =>
        selectedConnections.has(connection.id) ? { ...connection, visible } : connection
      )
    }));
    if (!visible) this.clearSelection();
  }

  public reassignSelectionToLayer(layerId: string): void {
    const target = this.#document.layers.find(({ id }) => id === layerId);
    if (target === undefined || target.locked) return;
    const selectedNodes = new Set(this.#editableSelectedNodes(true).map(({ id }) => id));
    const selectedConnections = new Set(
      this.#document.connections
        .filter(
          ({ id, locked, visible }) =>
            this.#selection.selectedConnectionIds.includes(id) && !locked && visible
        )
        .map(({ id }) => id)
    );
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      nodes: document.nodes.map((node) =>
        selectedNodes.has(node.id) ? { ...node, layerId } : node
      ),
      connections: document.connections.map((connection) =>
        selectedConnections.has(connection.id) ? { ...connection, layerId } : connection
      )
    }));
  }

  public insertNode(node: ScadaNode): void {
    this.execute(new InsertNodeCommand(node, this.#commandDependencies));
    if (this.#document.nodes.some(({ id }) => id === node.id)) this.selectNode(node.id);
  }

  public createConnection(connection: ScadaConnection): void {
    this.execute(new InsertConnectionCommand(connection, this.#commandDependencies));
    if (this.#document.connections.some(({ id }) => id === connection.id))
      this.selectConnection(connection.id);
  }

  public insertWaypoint(connectionId: string, point: Point): void {
    const connection = this.#editableConnection(connectionId);
    if (connection === undefined) return;
    const endpoints = this.#connectionEndpoints(connection);
    if (endpoints === undefined) return;
    const route = [endpoints.source, ...connection.waypoints, endpoints.target];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let projected = point;
    for (let index = 0; index < route.length - 1; index += 1) {
      const start = route[index];
      const end = route[index + 1];
      if (start === undefined || end === undefined) continue;
      const candidate = projectPointToSegment(point, start, end);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        projected = candidate;
      }
    }
    const waypoints = [...connection.waypoints];
    waypoints.splice(bestIndex, 0, projected);
    this.#updateConnection(connectionId, { ...connection, routing: "manual", waypoints });
  }

  public moveWaypoint(connectionId: string, waypointIndex: number, point: Point): void {
    const connection = this.#editableConnection(connectionId);
    if (connection?.waypoints[waypointIndex] === undefined) return;
    const waypoints = connection.waypoints.map((waypoint, index) =>
      index === waypointIndex ? point : waypoint
    );
    this.#updateConnection(connectionId, {
      ...connection,
      waypoints: normalizeRoute(waypoints)
    });
  }

  public removeWaypoint(connectionId: string, waypointIndex: number): void {
    const connection = this.#editableConnection(connectionId);
    if (connection?.waypoints[waypointIndex] === undefined) return;
    this.#updateConnection(connectionId, {
      ...connection,
      waypoints: connection.waypoints.filter((_waypoint, index) => index !== waypointIndex)
    });
  }

  public reconnectEndpoint(
    connectionId: string,
    endpoint: ConnectionEndpointName,
    nodeId: string,
    portId: string
  ): void {
    const connection = this.#editableConnection(connectionId);
    const node = this.#document.nodes.find(({ id }) => id === nodeId);
    if (connection === undefined || node === undefined || node.locked || !node.visible) return;
    this.#updateConnection(connectionId, {
      ...connection,
      [endpoint]: { nodeId, portId }
    });
  }

  public deleteSelection(): void {
    if (
      this.#selection.selectedNodeIds.length === 0 &&
      this.#selection.selectedConnectionIds.length === 0
    )
      return;
    const nodeIds = this.#editableSelectedNodes(true).map(({ id }) => id);
    const connectionIds = this.#document.connections
      .filter(
        ({ id, locked, visible }) =>
          this.#selection.selectedConnectionIds.includes(id) && !locked && visible
      )
      .map(({ id }) => id);
    if (nodeIds.length === 0 && connectionIds.length === 0) return;
    this.execute(new DeleteEntitiesCommand(nodeIds, connectionIds, this.#commandDependencies));
    this.clearSelection();
  }

  public updateNode(nodeId: string, update: (node: ScadaNode) => ScadaNode): void {
    this.execute(new UpdateNodeCommand(nodeId, update, this.#commandDependencies));
  }

  public async copy(): Promise<void> {
    const selected = new Set(this.#selection.selectedNodeIds);
    for (const node of this.#document.nodes)
      if (node.parentId !== undefined && selected.has(node.parentId)) selected.add(node.id);
    const fragment: DesignerClipboardFragment = {
      version: 1,
      nodes: this.#document.nodes.filter(({ id }) => selected.has(id)),
      connections: this.#document.connections.filter(
        ({ source, target }) => selected.has(source.nodeId) && selected.has(target.nodeId)
      ),
      bindings: this.#document.bindings.filter(
        ({ target }) =>
          ("nodeId" in target && selected.has(target.nodeId)) ||
          ("connectionId" in target &&
            this.#document.connections.some(
              ({ id, source, target: endpoint }) =>
                id === target.connectionId &&
                selected.has(source.nodeId) &&
                selected.has(endpoint.nodeId)
            )) ||
          (target.type === "visibility" && selected.has(target.entityId))
      )
    };
    if (fragment.nodes.length > 0) await this.#clipboard.write(JSON.stringify(fragment));
  }

  public async cut(): Promise<void> {
    await this.copy();
    this.deleteSelection();
  }

  public async paste(): Promise<void> {
    const fragment = parseClipboardFragment(await this.#clipboard.read());
    if (fragment === undefined) return;
    const idMap = new Map<string, string>();
    const layerId = this.#document.layers[0]?.id;
    if (layerId === undefined) return;
    for (const node of fragment.nodes) idMap.set(node.id, this.#ids.createNodeId());
    const nodes = fragment.nodes.map((node) => {
      const { parentId: sourceParentId, ...nodeWithoutParent } = node;
      const id = idMap.get(node.id);
      if (id === undefined) throw new Error(`Clipboard ID mapping missing: ${node.id}`);
      const parentId = sourceParentId === undefined ? undefined : idMap.get(sourceParentId);
      return {
        ...nodeWithoutParent,
        id,
        name: `${node.name} copy`,
        layerId: this.#document.layers.some(({ id: candidate }) => candidate === node.layerId)
          ? node.layerId
          : layerId,
        transform: {
          ...node.transform,
          x: node.transform.x + this.#options.pasteOffset.x,
          y: node.transform.y + this.#options.pasteOffset.y
        },
        ...(parentId === undefined ? {} : { parentId })
      };
    });
    const connections = fragment.connections.flatMap((connection) => {
      const sourceNodeId = idMap.get(connection.source.nodeId);
      const targetNodeId = idMap.get(connection.target.nodeId);
      if (sourceNodeId === undefined || targetNodeId === undefined) return [];
      return [
        {
          ...connection,
          id: this.#ids.createConnectionId(),
          source: { ...connection.source, nodeId: sourceNodeId },
          target: { ...connection.target, nodeId: targetNodeId }
        }
      ];
    });
    const connectionIdMap = new Map(
      fragment.connections.flatMap((connection, index) => {
        const pasted = connections[index];
        return pasted === undefined ? [] : [[connection.id, pasted.id] as const];
      })
    );
    const bindingsByOldId = new Map<string, string>();
    const bindings = (fragment.bindings ?? []).flatMap((binding) => {
      let target = binding.target;
      if ("nodeId" in target) {
        const nodeId = idMap.get(target.nodeId);
        if (nodeId === undefined) return [];
        target = { ...target, nodeId };
      } else if ("connectionId" in target) {
        const connectionId = connectionIdMap.get(target.connectionId);
        if (connectionId === undefined) return [];
        target = { ...target, connectionId };
      } else {
        const entityId = idMap.get(target.entityId) ?? connectionIdMap.get(target.entityId);
        if (entityId === undefined) return [];
        target = { ...target, entityId };
      }
      const id = this.#ids.createBindingId();
      bindingsByOldId.set(binding.id, id);
      return [{ ...binding, id, target }];
    });
    const nodesWithBindings = nodes.map((node, index) => ({
      ...node,
      bindings:
        fragment.nodes[index]?.bindings.flatMap((id) => {
          const mapped = bindingsByOldId.get(id);
          return mapped === undefined ? [] : [mapped];
        }) ?? []
    }));
    this.execute(
      new InsertFragmentCommand(nodesWithBindings, connections, this.#commandDependencies, bindings)
    );
    this.setSelection({
      selectedNodeIds: nodesWithBindings.map(({ id }) => id),
      selectedConnectionIds: []
    });
  }

  public async duplicate(): Promise<void> {
    await this.copy();
    await this.paste();
  }

  public reorderSelection(operation: NodeOrderOperation): void {
    const ids = this.#editableSelectedNodes(false).map(({ id }) => id);
    if (ids.length === 0) return;
    this.execute(new ReorderNodesCommand(ids, operation, this.#commandDependencies));
  }

  public setViewport(viewport: Viewport): void {
    this.#viewport = { ...viewport };
    this.#renderer?.setViewport(this.#viewport);
    this.#emitState("viewport-changed");
  }

  public centerSelection(viewportSize: Size): void {
    const bounds = unionBounds(
      ...this.#document.nodes
        .filter(({ id }) => this.#selection.selectedNodeIds.includes(id))
        .map(({ transform }) => ({
          left: transform.x,
          top: transform.y,
          right: transform.x + transform.width,
          bottom: transform.y + transform.height
        }))
    );
    if (bounds === undefined) return;
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    this.setViewport({
      ...this.#viewport,
      x: viewportSize.width / 2 - centerX * this.#viewport.zoom,
      y: viewportSize.height / 2 - centerY * this.#viewport.zoom
    });
  }

  public toCanvasPoint(screenPoint: Point): Point {
    return viewportPointToCanvas(screenPoint, this.#viewport);
  }

  public setActiveTool(tool: DesignerToolId): void {
    this.#activeTool = tool;
    this.#emitState("tool-changed");
  }

  public setHover(hover: HoverState): void {
    this.#hover = hover;
    this.#emitState("hover-changed");
  }

  public setInteraction(interaction: DesignerInteraction): void {
    this.#interaction = interaction;
    this.#emitState("interaction-changed");
  }

  public setGuides(guides: readonly AlignmentGuide[]): void {
    this.#guides = [...guides];
    this.#emitState("interaction-changed");
  }

  public subscribe(listener: (event: DomainEvent) => void): () => void {
    this.#domainListeners.add(listener);
    return () => this.#domainListeners.delete(listener);
  }

  public subscribeState(listener: DesignerStateListener): () => void {
    this.#stateListeners.add(listener);
    return () => this.#stateListeners.delete(listener);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#stateListeners.clear();
    this.#domainListeners.clear();
    this.#history.clear();
    this.#disposed = true;
  }

  public static modeFromModifiers(shift: boolean, ctrlOrMeta: boolean): SelectionMode {
    return selectionMode(shift, ctrlOrMeta);
  }

  #commitDocument(previous: ScadaDocument, next: ScadaDocument): void {
    if (next === previous) return;
    this.#document = next;
    const changes = deriveDocumentChangeSet(previous, next);
    this.#renderer?.renderChanges(next, changes);
    this.setSelection(this.#selection);
    const event: DomainEvent = {
      id: this.#ids.create("group"),
      type: "document-updated",
      timestamp: this.#clock.now(),
      documentId: next.id,
      payload: {
        addedNodeIds: changes.addedNodeIds,
        updatedNodeIds: changes.updatedNodeIds,
        removedNodeIds: changes.removedNodeIds
      },
      metadata: { source: "designer-engine" }
    };
    for (const listener of this.#domainListeners) listener(event);
    this.#emitState("document-changed", changes);
    this.#emitState("history-changed");
  }

  #executeAtomic(
    type: Command["type"],
    operation: (document: ScadaDocument) => ScadaDocument
  ): void {
    this.execute(new AtomicDocumentCommand(type, operation, this.#commandDependencies));
  }

  #editableSelectedNodes(includeGroupChildren: boolean): readonly ScadaNode[] {
    const selected = new Set(this.#selection.selectedNodeIds);
    if (includeGroupChildren)
      for (const node of this.#document.nodes)
        if (node.parentId !== undefined && selected.has(node.parentId)) selected.add(node.id);
    return this.#document.nodes.filter(
      ({ id, locked, visible }) => selected.has(id) && !locked && visible
    );
  }

  #nodeBounds(nodes: readonly ScadaNode[]): Rectangle | undefined {
    const bounds = unionBounds(
      ...nodes.map(({ transform }) => rectangleToBounds(rotatedBounds(transform)))
    );
    return bounds === undefined
      ? undefined
      : {
          x: bounds.left,
          y: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top
        };
  }

  #transformPositions(deltas: ReadonlyMap<string, Point>): void {
    this.#executeAtomic("move-node", (document) => ({
      ...document,
      nodes: document.nodes.map((node) => {
        const delta = deltas.get(node.id);
        return delta === undefined
          ? node
          : {
              ...node,
              transform: {
                ...node.transform,
                x: node.transform.x + delta.x,
                y: node.transform.y + delta.y
              }
            };
      })
    }));
  }

  #editableConnection(connectionId: string): ScadaConnection | undefined {
    return this.#document.connections.find(
      ({ id, locked, visible }) => id === connectionId && !locked && visible
    );
  }

  #updateConnection(connectionId: string, replacement: ScadaConnection): void {
    this.#executeAtomic("update-property", (document) => ({
      ...document,
      connections: document.connections.map((connection) =>
        connection.id === connectionId ? replacement : connection
      )
    }));
  }

  #connectionEndpoints(
    connection: ScadaConnection
  ): { readonly source: Point; readonly target: Point } | undefined {
    const resolve = (nodeId: string, portId: string): Point | undefined => {
      const node = this.#document.nodes.find(({ id }) => id === nodeId);
      const definition = node === undefined ? undefined : this.#symbols.get(node.symbolType);
      const port = definition?.ports.find(({ id }) => id === portId);
      return node === undefined || port === undefined
        ? undefined
        : calculatePortPosition(node.transform, port.position);
    };
    const source = resolve(connection.source.nodeId, connection.source.portId);
    const target = resolve(connection.target.nodeId, connection.target.portId);
    return source === undefined || target === undefined ? undefined : { source, target };
  }

  #emitState(type: DesignerStateEvent["type"], changes?: DesignerStateEvent["changes"]): void {
    const event: DesignerStateEvent =
      changes === undefined
        ? { type, state: this.getRuntimeState() }
        : { type, state: this.getRuntimeState(), changes };
    for (const listener of this.#stateListeners) listener(event);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Designer Engine has been disposed.");
  }
}

export function createDesignerEngine(options: CreateDesignerEngineOptions): DesignerController {
  return new NativeDesignerEngine(options);
}
