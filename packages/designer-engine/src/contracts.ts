import type {
  Command,
  DocumentChangeSet,
  DomainEvent,
  ScadaConnection,
  ScadaDocument,
  ScadaNode
} from "@web-scada/core";
import type { Point, Rectangle, Viewport } from "@web-scada/geometry";

export interface SelectionState {
  readonly selectedNodeIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
}

export type DesignerToolId = "select" | "pan" | "rectangle" | "connection" | (string & {});
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type HoverEntityType = "node" | "connection" | "port" | "handle";

export interface HoverState {
  readonly entityType?: HoverEntityType | undefined;
  readonly entityId?: string | undefined;
  readonly nodeId?: string | undefined;
  readonly portId?: string | undefined;
}

export interface AlignmentGuide {
  readonly axis: "x" | "y";
  readonly position: number;
  readonly from: number;
  readonly to: number;
}

export type DesignerInteraction =
  | { readonly type: "idle" }
  | {
      readonly type: "marquee";
      readonly origin: Point;
      readonly current: Point;
    }
  | {
      readonly type: "drag";
      readonly origin: Point;
      readonly current: Point;
      readonly originalNodes: readonly ScadaNode[];
    }
  | {
      readonly type: "resize";
      readonly nodeId: string;
      readonly handle: ResizeHandle;
      readonly origin: Point;
      readonly originalNode: ScadaNode;
    }
  | {
      readonly type: "connection";
      readonly sourceNodeId: string;
      readonly sourcePortId: string;
      readonly current: Point;
    };

export interface DesignerState {
  readonly document: ScadaDocument;
  readonly selection: SelectionState;
  readonly viewport: Viewport;
}

export interface DesignerRuntimeState extends DesignerState {
  readonly activeTool: DesignerToolId;
  readonly hover: HoverState;
  readonly interaction: DesignerInteraction;
  readonly guides: readonly AlignmentGuide[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface SnapOptions {
  readonly enabled: boolean;
  readonly grid: boolean;
  readonly alignment: boolean;
  readonly ports: boolean;
  readonly boundingBoxes: boolean;
  readonly threshold: number;
}

export interface DesignerOptions {
  readonly snap: SnapOptions;
  readonly pasteOffset: Point;
}

export interface DesignerRenderAdapter {
  renderDocument(document: Readonly<ScadaDocument>): void;
  renderChanges(document: Readonly<ScadaDocument>, changes: Readonly<DocumentChangeSet>): void;
  setViewport(viewport: Viewport): void;
}

export interface DesignerStateEvent {
  readonly type:
    | "document-changed"
    | "selection-changed"
    | "viewport-changed"
    | "tool-changed"
    | "interaction-changed"
    | "hover-changed"
    | "history-changed";
  readonly state: DesignerRuntimeState;
  readonly changes?: DocumentChangeSet;
}

export type DesignerStateListener = (event: DesignerStateEvent) => void;

export interface DesignerEngine {
  getState(): DesignerState;
  execute(command: Command): void;
  setSelection(selection: SelectionState): void;
  setViewport(viewport: Viewport): void;
  toCanvasPoint(screenPoint: Point): Point;
  subscribe(listener: (event: DomainEvent) => void): () => void;
}

export interface DesignerController extends DesignerEngine {
  getRuntimeState(): DesignerRuntimeState;
  subscribeState(listener: DesignerStateListener): () => void;
  setActiveTool(tool: DesignerToolId): void;
  setHover(hover: HoverState): void;
  selectNode(nodeId: string, mode?: SelectionMode): void;
  selectConnection(connectionId: string, mode?: SelectionMode): void;
  selectAll(): void;
  clearSelection(): void;
  selectMarquee(bounds: Rectangle, mode?: SelectionMode): void;
  moveSelection(delta: Point): void;
  resizeNode(nodeId: string, handle: ResizeHandle, delta: Point): void;
  insertNode(node: ScadaNode): void;
  createConnection(connection: ScadaConnection): void;
  deleteSelection(): void;
  updateNode(nodeId: string, update: (node: ScadaNode) => ScadaNode): void;
  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;
  duplicate(): Promise<void>;
  undo(): void;
  redo(): void;
  reorderSelection(operation: NodeOrderOperation): void;
  centerSelection(viewportSize: { readonly width: number; readonly height: number }): void;
  setInteraction(interaction: DesignerInteraction): void;
  setGuides(guides: readonly AlignmentGuide[]): void;
  dispose(): void;
}

export type SelectionMode = "replace" | "add" | "toggle";
export type NodeOrderOperation = "forward" | "backward" | "front" | "back";

export interface ClipboardAdapter {
  write(documentFragment: string): Promise<void>;
  read(): Promise<string>;
}

export interface DesignerClipboardFragment {
  readonly version: 1;
  readonly nodes: readonly ScadaNode[];
  readonly connections: readonly ScadaConnection[];
}

export interface DesignerPointerEvent {
  readonly point: Point;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly nodeId?: string | undefined;
  readonly portId?: string | undefined;
}

export interface DesignerKeyboardEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface DesignerTool {
  readonly id: DesignerToolId;
  activate?(): void;
  pointerDown(event: DesignerPointerEvent): void;
  pointerMove(event: DesignerPointerEvent): void;
  pointerUp(event: DesignerPointerEvent): void;
  keyDown(event: DesignerKeyboardEvent): void;
  cancel(): void;
  cleanup(): void;
}

export interface ToolRegistry {
  register(tool: DesignerTool): void;
  unregister(id: DesignerToolId): boolean;
  get(id: DesignerToolId): DesignerTool | undefined;
  getAll(): readonly DesignerTool[];
}

export type DesignerShortcutAction =
  | "delete"
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "undo"
  | "redo"
  | "select-all"
  | "clear-selection"
  | "temporary-pan";

export type KeyboardShortcutMap = Readonly<Record<string, DesignerShortcutAction>>;
