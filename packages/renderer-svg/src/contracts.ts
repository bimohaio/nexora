import type { DocumentChangeSet, JsonValue, ScadaDocument } from "@web-scada/core";
import type { Point, Size, Viewport } from "@web-scada/geometry";
import type { SymbolRegistry, SymbolState } from "@web-scada/symbols";

export type GridPattern = "lines" | "dots" | "cross";
export type PortVisibility = "always" | "hover" | "never";

export interface RendererOptions {
  readonly showGrid: boolean;
  readonly showPorts: boolean;
  readonly showLockedState: boolean;
  readonly showDebugBounds: boolean;
  readonly enablePointerEvents: boolean;
  readonly background?: string;
  readonly gridSize?: number;
  readonly gridPattern: GridPattern;
  readonly portVisibility: PortVisibility;
  readonly connectionHitAreaWidth: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly ariaLabel: string;
}

export const DEFAULT_RENDERER_OPTIONS: RendererOptions = {
  showGrid: true,
  showPorts: true,
  showLockedState: true,
  showDebugBounds: false,
  enablePointerEvents: true,
  gridPattern: "lines",
  portVisibility: "always",
  connectionHitAreaWidth: 12,
  minZoom: 0.1,
  maxZoom: 8,
  ariaLabel: "SCADA process diagram"
};

export type RendererEventType =
  | "renderer-mounted"
  | "renderer-unmounted"
  | "render-started"
  | "render-completed"
  | "render-failed"
  | "viewport-changed"
  | "entity-pointer-enter"
  | "entity-pointer-leave"
  | "entity-pointer-down"
  | "symbol-metadata-missing"
  | "symbol-renderer-missing";

export interface EntityPointerMetadata {
  readonly entityType?: string;
  readonly entityId?: string;
  readonly nodeId?: string;
  readonly portId?: string;
  readonly connectionId?: string;
  readonly layerId?: string;
}

export interface RendererEvent {
  readonly type: RendererEventType;
  readonly timestamp: string;
  readonly metadata: EntityPointerMetadata;
  readonly context: Readonly<Record<string, JsonValue>>;
}

export type RendererEventListener = (event: RendererEvent) => void;

export interface RendererResolvedSymbolVisualState {
  readonly symbolId: string;
  readonly revision: number;
  readonly effectiveState: SymbolState;
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly visible?: boolean;
}

export interface RuntimeVisualStateReader {
  getNodeVisualState?(nodeId: string): RendererResolvedSymbolVisualState | undefined;
  getNodeState(nodeId: string): SymbolState | undefined;
  getNodeProperties?(nodeId: string): Readonly<Record<string, JsonValue>> | undefined;
  getNodeVisibility?(nodeId: string): boolean | undefined;
  getConnectionStyle?(
    connectionId: string
  ): Partial<ScadaDocument["connections"][number]["style"]> | undefined;
  getConnectionVisibility?(connectionId: string): boolean | undefined;
}

export interface RendererRuntimeSnapshot extends RuntimeVisualStateReader {
  readonly revision: number;
  readonly timestamp: number;
}

export interface RendererRuntimeChangeSet {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly addedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedConnectionIds: readonly string[];
  readonly updatedConnectionIds: readonly string[];
  readonly removedConnectionIds: readonly string[];
  readonly reset: boolean;
}

export interface RendererLogger {
  warn(message: string, context: Readonly<Record<string, JsonValue>>): void;
  error(message: string, context: Readonly<Record<string, JsonValue>>): void;
}

export interface SvgSymbolRenderContext {
  readonly document: ScadaDocument;
  readonly node: ScadaDocument["nodes"][number];
  readonly state: SymbolState;
  readonly visualState?: RendererResolvedSymbolVisualState;
}

export interface SvgSymbolRenderer {
  create(context: SvgSymbolRenderContext): SVGGElement;
  update(element: SVGGElement, context: SvgSymbolRenderContext): void;
  updateDesign?(element: SVGGElement, context: SvgSymbolRenderContext): void;
  updateRuntime?(
    element: SVGGElement,
    context: SvgSymbolRenderContext,
    changedProperties?: readonly string[]
  ): void;
  dispose?(element: SVGGElement): void;
}

export interface SvgSymbolRendererRegistry {
  register(symbolType: string, renderer: SvgSymbolRenderer): void;
  get(symbolType: string): SvgSymbolRenderer | undefined;
}

export interface SvgRendererDependencies {
  readonly symbols: SymbolRegistry;
  readonly symbolRenderers?: SvgSymbolRendererRegistry;
  readonly options?: Partial<RendererOptions>;
  readonly onEvent?: RendererEventListener;
  readonly logger?: RendererLogger;
  readonly runtimeState?: RuntimeVisualStateReader;
}

export interface SvgRenderer {
  mount(container: HTMLElement): void;
  unmount(): void;
  renderDocument(document: Readonly<ScadaDocument>): void;
  renderChanges(document: Readonly<ScadaDocument>, changes: Readonly<DocumentChangeSet>): void;
  scheduleRenderChanges(
    document: Readonly<ScadaDocument>,
    changes: Readonly<DocumentChangeSet>
  ): void;
  setViewport(viewport: Viewport): void;
  setZoom(zoom: number, anchor?: Point): void;
  panBy(delta: Point): void;
  fitToView(padding?: number): void;
  resetViewport(): void;
  resize(size: Size): void;
  setOptions(options: Partial<RendererOptions>): void;
  refreshRuntimeStates(nodeIds?: readonly string[], connectionIds?: readonly string[]): void;
  renderRuntimeChanges(snapshot: RendererRuntimeSnapshot, diff: RendererRuntimeChangeSet): void;
  getViewport(): Viewport;
  getElementForNode(nodeId: string): SVGGElement | undefined;
  getElementForConnection(connectionId: string): SVGPathElement | undefined;
  getElementForPort(nodeId: string, portId: string): SVGElement | undefined;
  getSvgElement(): SVGSVGElement | undefined;
  dispose(): void;
}

export interface RendererHitAdapter {
  hitNode(nodeId: string, worldPosition: Point): boolean;
  hitConnection(connectionId: string, worldPosition: Point, tolerance?: number): boolean;
  hitPort(nodeId: string, portId: string, worldPosition: Point): boolean;
}
