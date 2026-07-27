import type { EntityIdGenerator, ScadaConnection } from "@web-scada/core";
import type { Point, Rectangle } from "@web-scada/geometry";
import type { SymbolRegistry } from "@web-scada/symbols";
import { NativeDesignerEngine } from "./engine.js";
import type {
  DesignerController,
  DesignerKeyboardEvent,
  DesignerPointerEvent,
  DesignerShortcutAction,
  DesignerTool,
  DesignerToolId,
  KeyboardShortcutMap,
  ToolRegistry
} from "./contracts.js";

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutMap = {
  Delete: "delete",
  Backspace: "delete",
  "Control+c": "copy",
  "Meta+c": "copy",
  "Control+x": "cut",
  "Meta+x": "cut",
  "Control+v": "paste",
  "Meta+v": "paste",
  "Control+d": "duplicate",
  "Meta+d": "duplicate",
  "Control+g": "group",
  "Meta+g": "group",
  "Control+Shift+g": "ungroup",
  "Meta+Shift+g": "ungroup",
  "Control+z": "undo",
  "Meta+z": "undo",
  "Control+Shift+z": "redo",
  "Meta+Shift+z": "redo",
  "Control+y": "redo",
  "Control+a": "select-all",
  "Meta+a": "select-all",
  Escape: "clear-selection",
  ArrowLeft: "nudge-left",
  ArrowRight: "nudge-right",
  ArrowUp: "nudge-up",
  ArrowDown: "nudge-down",
  "Shift+ArrowLeft": "nudge-left-large",
  "Shift+ArrowRight": "nudge-right-large",
  "Shift+ArrowUp": "nudge-up-large",
  "Shift+ArrowDown": "nudge-down-large",
  "]": "bring-forward",
  "[": "send-backward",
  " ": "temporary-pan"
};

export function shortcutKey(event: DesignerKeyboardEvent): string {
  const modifiers = [
    event.ctrlKey ? "Control" : "",
    event.metaKey ? "Meta" : "",
    event.shiftKey ? "Shift" : ""
  ].filter(Boolean);
  return [...modifiers, event.key].join("+");
}

export function handleDesignerShortcut(
  designer: DesignerController,
  event: DesignerKeyboardEvent,
  shortcuts: KeyboardShortcutMap = DEFAULT_KEYBOARD_SHORTCUTS
): DesignerShortcutAction | undefined {
  const action = shortcuts[shortcutKey(event)];
  if (action === "delete") designer.deleteSelection();
  else if (action === "copy") void designer.copy();
  else if (action === "cut") void designer.cut();
  else if (action === "paste") void designer.paste();
  else if (action === "duplicate") void designer.duplicate();
  else if (action === "group") designer.groupSelection();
  else if (action === "ungroup") designer.ungroupSelection();
  else if (action === "undo") designer.undo();
  else if (action === "redo") designer.redo();
  else if (action === "select-all") designer.selectAll();
  else if (action === "nudge-left") designer.nudgeSelection({ x: -1, y: 0 });
  else if (action === "nudge-right") designer.nudgeSelection({ x: 1, y: 0 });
  else if (action === "nudge-up") designer.nudgeSelection({ x: 0, y: -1 });
  else if (action === "nudge-down") designer.nudgeSelection({ x: 0, y: 1 });
  else if (action === "nudge-left-large") designer.nudgeSelection({ x: -10, y: 0 });
  else if (action === "nudge-right-large") designer.nudgeSelection({ x: 10, y: 0 });
  else if (action === "nudge-up-large") designer.nudgeSelection({ x: 0, y: -10 });
  else if (action === "nudge-down-large") designer.nudgeSelection({ x: 0, y: 10 });
  else if (action === "bring-forward") designer.reorderSelection("forward");
  else if (action === "send-backward") designer.reorderSelection("backward");
  else if (action === "clear-selection") {
    designer.setInteraction({ type: "idle" });
    designer.clearSelection();
  } else if (action === "temporary-pan") designer.setActiveTool("pan");
  return action;
}

export interface DesignerFocusTarget {
  readonly tagName?: string;
  readonly contentEditable?: boolean;
  readonly shortcutGuard?: boolean;
}

export function isDesignerShortcutTarget(target: DesignerFocusTarget | undefined): boolean {
  const tagName = target?.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.contentEditable === true ||
    target?.shortcutGuard === true
  );
}

export class InMemoryToolRegistry implements ToolRegistry {
  readonly #tools = new Map<DesignerToolId, DesignerTool>();

  public register(tool: DesignerTool): void {
    if (this.#tools.has(tool.id)) throw new Error(`Designer tool already exists: ${tool.id}`);
    this.#tools.set(tool.id, tool);
  }

  public unregister(id: DesignerToolId): boolean {
    const tool = this.#tools.get(id);
    tool?.cleanup();
    return this.#tools.delete(id);
  }

  public get(id: DesignerToolId): DesignerTool | undefined {
    return this.#tools.get(id);
  }

  public getAll(): readonly DesignerTool[] {
    return [...this.#tools.values()];
  }
}

export class DesignerToolController {
  #active: DesignerTool | undefined;

  public constructor(
    private readonly designer: DesignerController,
    private readonly tools: ToolRegistry
  ) {}

  public activate(id: DesignerToolId): void {
    if (this.#active?.id === id) return;
    this.#active?.cancel();
    this.#active?.cleanup();
    const tool = this.tools.get(id);
    if (tool === undefined) throw new Error(`Designer tool not found: ${id}`);
    this.#active = tool;
    this.designer.setActiveTool(id);
    tool.activate?.();
  }

  public pointerDown(event: DesignerPointerEvent): void {
    this.#active?.pointerDown(event);
  }

  public pointerMove(event: DesignerPointerEvent): void {
    this.#active?.pointerMove(event);
  }

  public pointerUp(event: DesignerPointerEvent): void {
    this.#active?.pointerUp(event);
  }

  public keyDown(event: DesignerKeyboardEvent): void {
    this.#active?.keyDown(event);
  }

  public cancel(): void {
    this.#active?.cancel();
  }

  public dispose(): void {
    this.#active?.cleanup();
    this.#active = undefined;
  }
}

abstract class BaseTool implements DesignerTool {
  public abstract readonly id: DesignerToolId;

  public constructor(protected readonly designer: DesignerController) {}

  public abstract pointerDown(event: DesignerPointerEvent): void;
  public abstract pointerMove(event: DesignerPointerEvent): void;
  public abstract pointerUp(event: DesignerPointerEvent): void;

  public keyDown(event: DesignerKeyboardEvent): void {
    handleDesignerShortcut(this.designer, event);
  }

  public cancel(): void {
    this.designer.setInteraction({ type: "idle" });
    this.designer.setGuides([]);
  }

  public cleanup(): void {
    this.cancel();
  }
}

export class SelectTool extends BaseTool {
  public readonly id = "select";

  public pointerDown(event: DesignerPointerEvent): void {
    const mode = NativeDesignerEngine.modeFromModifiers(
      event.shiftKey,
      event.ctrlKey || event.metaKey
    );
    if (
      (event.entityType === "node" || event.entityType === "port") &&
      event.nodeId !== undefined
    ) {
      const pointedNode = this.designer
        .getState()
        .document.nodes.find(({ id }) => id === event.nodeId);
      const selectionTarget = pointedNode?.parentId ?? event.nodeId;
      this.designer.selectNode(selectionTarget, mode);
      const selected = new Set(this.designer.getState().selection.selectedNodeIds);
      const originalNodes = this.designer
        .getState()
        .document.nodes.filter(({ id }) => selected.has(id));
      this.designer.setInteraction({
        type: "drag",
        origin: event.point,
        current: event.point,
        originalNodes
      });
      return;
    }
    if (event.entityType === "connection" && event.entityId !== undefined) {
      this.designer.selectConnection(event.entityId, mode);
      return;
    }
    this.designer.setInteraction({
      type: "marquee",
      origin: event.point,
      current: event.point
    });
    if (mode === "replace") this.designer.clearSelection();
  }

  public pointerMove(event: DesignerPointerEvent): void {
    const interaction = this.designer.getRuntimeState().interaction;
    if (interaction.type === "drag")
      this.designer.setInteraction({ ...interaction, current: event.point });
    else if (interaction.type === "marquee") {
      this.designer.setInteraction({ ...interaction, current: event.point });
      this.designer.selectMarquee(rectangleFromPoints(interaction.origin, event.point), "replace");
    }
  }

  public pointerUp(event: DesignerPointerEvent): void {
    const interaction = this.designer.getRuntimeState().interaction;
    if (interaction.type === "drag") {
      this.designer.moveSelection({
        x: event.point.x - interaction.origin.x,
        y: event.point.y - interaction.origin.y
      });
    } else if (interaction.type === "marquee")
      this.designer.selectMarquee(rectangleFromPoints(interaction.origin, event.point), "replace");
    this.designer.setInteraction({ type: "idle" });
  }
}

export class PanTool extends BaseTool {
  public readonly id = "pan";
  #origin: Point | undefined;
  #viewportOrigin: Point | undefined;

  public pointerDown(event: DesignerPointerEvent): void {
    this.#origin = event.point;
    const viewport = this.designer.getState().viewport;
    this.#viewportOrigin = { x: viewport.x, y: viewport.y };
  }

  public pointerMove(event: DesignerPointerEvent): void {
    if (this.#origin === undefined || this.#viewportOrigin === undefined) return;
    this.designer.setViewport({
      ...this.designer.getState().viewport,
      x: this.#viewportOrigin.x + event.point.x - this.#origin.x,
      y: this.#viewportOrigin.y + event.point.y - this.#origin.y
    });
  }

  public pointerUp(): void {
    this.#origin = undefined;
    this.#viewportOrigin = undefined;
  }

  public override cancel(): void {
    super.cancel();
    this.pointerUp();
  }
}

export interface RectangleToolOptions {
  readonly symbols: SymbolRegistry;
  readonly ids: EntityIdGenerator;
  readonly symbolType?: string;
}

export class RectangleTool extends BaseTool {
  public readonly id = "rectangle";
  #origin: Point | undefined;

  public constructor(
    designer: DesignerController,
    private readonly options: RectangleToolOptions
  ) {
    super(designer);
  }

  public pointerDown(event: DesignerPointerEvent): void {
    this.#origin = event.point;
  }

  public pointerMove(event: DesignerPointerEvent): void {
    if (this.#origin === undefined) return;
    this.designer.setInteraction({
      type: "marquee",
      origin: this.#origin,
      current: event.point
    });
  }

  public pointerUp(event: DesignerPointerEvent): void {
    const origin = this.#origin;
    this.#origin = undefined;
    this.designer.setInteraction({ type: "idle" });
    if (origin === undefined) return;
    const type = this.options.symbolType ?? "basic.rectangle";
    const definition = this.options.symbols.get(type);
    const layerId = this.designer.getState().document.layers[0]?.id;
    if (definition === undefined || layerId === undefined) return;
    const bounds = rectangleFromPoints(origin, event.point);
    const width = Math.max(definition.minimumWidth, bounds.width || definition.defaultWidth);
    const height = Math.max(definition.minimumHeight, bounds.height || definition.defaultHeight);
    this.designer.insertNode({
      id: this.options.ids.createNodeId(),
      name: "Rectangle",
      symbolType: type,
      transform: {
        x: origin.x,
        y: origin.y,
        width,
        height,
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
  }
}

export interface ConnectionToolOptions {
  readonly ids: EntityIdGenerator;
}

export class ConnectionTool extends BaseTool {
  public readonly id = "connection";
  #source: { readonly nodeId: string; readonly portId: string } | undefined;

  public constructor(
    designer: DesignerController,
    private readonly options: ConnectionToolOptions
  ) {
    super(designer);
  }

  public pointerDown(event: DesignerPointerEvent): void {
    if (event.entityType !== "port" || event.nodeId === undefined || event.portId === undefined)
      return;
    this.#source = { nodeId: event.nodeId, portId: event.portId };
    this.designer.setInteraction({
      type: "connection",
      sourceNodeId: event.nodeId,
      sourcePortId: event.portId,
      current: event.point
    });
  }

  public pointerMove(event: DesignerPointerEvent): void {
    const interaction = this.designer.getRuntimeState().interaction;
    if (interaction.type === "connection")
      this.designer.setInteraction({ ...interaction, current: event.point });
  }

  public pointerUp(event: DesignerPointerEvent): void {
    const source = this.#source;
    this.#source = undefined;
    this.designer.setInteraction({ type: "idle" });
    if (
      source === undefined ||
      event.entityType !== "port" ||
      event.nodeId === undefined ||
      event.portId === undefined ||
      (source.nodeId === event.nodeId && source.portId === event.portId)
    )
      return;
    const sourceNode = this.designer
      .getState()
      .document.nodes.find(({ id }) => id === source.nodeId);
    if (sourceNode === undefined) return;
    const connection: ScadaConnection = {
      id: this.options.ids.createConnectionId(),
      name: "Connection",
      source,
      target: { nodeId: event.nodeId, portId: event.portId },
      routing: "direct",
      waypoints: [],
      medium: "generic",
      direction: "forward",
      style: {},
      layerId: sourceNode.layerId,
      visible: true,
      locked: false
    };
    this.designer.createConnection(connection);
  }

  public override cancel(): void {
    super.cancel();
    this.#source = undefined;
  }
}

export function rectangleFromPoints(left: Point, right: Point): Rectangle {
  return {
    x: Math.min(left.x, right.x),
    y: Math.min(left.y, right.y),
    width: Math.abs(right.x - left.x),
    height: Math.abs(right.y - left.y)
  };
}
