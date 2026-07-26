import type { ScadaDocument, ScadaLayer } from "@web-scada/core";
import type { Size, Viewport } from "@web-scada/geometry";
import type { SymbolRegistry } from "@web-scada/symbols";

export interface RenderContext {
  readonly symbols: SymbolRegistry;
  readonly viewport: Viewport;
  readonly pixelRatio: number;
}

export interface RenderResult {
  readonly renderedNodeCount: number;
  readonly renderedConnectionCount: number;
}

export interface RenderChangeSet {
  readonly addedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedConnectionIds: readonly string[];
  readonly updatedConnectionIds: readonly string[];
  readonly removedConnectionIds: readonly string[];
  readonly changedLayers: readonly ScadaLayer[];
}

export interface SvgRenderer {
  mount(container: Element): void;
  unmount(): void;
  renderDocument(document: ScadaDocument, context: RenderContext): RenderResult;
  renderChanges(
    document: ScadaDocument,
    changes: RenderChangeSet,
    context: RenderContext
  ): RenderResult;
  resize(size: Size): void;
  setViewport(viewport: Viewport): void;
  dispose(): void;
}
