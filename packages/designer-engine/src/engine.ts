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
  NodeOrderOperation,
  ResizeHandle,
  SelectionMode,
  SelectionState
} from "./contracts.js";
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
    const nodes = this.#document.nodes.filter(({ id }) =>
      this.#selection.selectedNodeIds.includes(id)
    );
    const snapped = snapNodeDelta(this.#document, nodes, delta, this.#options.snap);
    this.setGuides(snapped.guides);
    this.execute(
      new MoveNodesCommand(
        this.#selection.selectedNodeIds,
        snapped.delta,
        this.#commandDependencies
      )
    );
    this.setGuides([]);
  }

  public resizeNode(nodeId: string, handle: ResizeHandle, delta: Point): void {
    const node = this.#document.nodes.find(({ id }) => id === nodeId);
    if (node === undefined) return;
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

  public insertNode(node: ScadaNode): void {
    this.execute(new InsertNodeCommand(node, this.#commandDependencies));
    if (this.#document.nodes.some(({ id }) => id === node.id)) this.selectNode(node.id);
  }

  public createConnection(connection: ScadaConnection): void {
    this.execute(new InsertConnectionCommand(connection, this.#commandDependencies));
    if (this.#document.connections.some(({ id }) => id === connection.id))
      this.selectConnection(connection.id);
  }

  public deleteSelection(): void {
    if (
      this.#selection.selectedNodeIds.length === 0 &&
      this.#selection.selectedConnectionIds.length === 0
    )
      return;
    this.execute(
      new DeleteEntitiesCommand(
        this.#selection.selectedNodeIds,
        this.#selection.selectedConnectionIds,
        this.#commandDependencies
      )
    );
    this.clearSelection();
  }

  public updateNode(nodeId: string, update: (node: ScadaNode) => ScadaNode): void {
    this.execute(new UpdateNodeCommand(nodeId, update, this.#commandDependencies));
  }

  public async copy(): Promise<void> {
    const selected = new Set(this.#selection.selectedNodeIds);
    const fragment: DesignerClipboardFragment = {
      version: 1,
      nodes: this.#document.nodes.filter(({ id }) => selected.has(id)),
      connections: this.#document.connections.filter(
        ({ source, target }) => selected.has(source.nodeId) && selected.has(target.nodeId)
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
    const nodes = fragment.nodes.map((node) => {
      const id = this.#ids.createNodeId();
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        name: `${node.name} copy`,
        layerId: this.#document.layers.some(({ id: candidate }) => candidate === node.layerId)
          ? node.layerId
          : layerId,
        transform: {
          ...node.transform,
          x: node.transform.x + this.#options.pasteOffset.x,
          y: node.transform.y + this.#options.pasteOffset.y
        }
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
    this.execute(new InsertFragmentCommand(nodes, connections, this.#commandDependencies));
    this.setSelection({ selectedNodeIds: nodes.map(({ id }) => id), selectedConnectionIds: [] });
  }

  public async duplicate(): Promise<void> {
    await this.copy();
    await this.paste();
  }

  public reorderSelection(operation: NodeOrderOperation): void {
    this.execute(
      new ReorderNodesCommand(this.#selection.selectedNodeIds, operation, this.#commandDependencies)
    );
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
