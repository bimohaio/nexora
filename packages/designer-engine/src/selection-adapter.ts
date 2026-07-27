import type { ScadaDocument } from "@web-scada/core";
import type {
  SelectionManager,
  InteractionTarget,
  SelectionPolicy,
  SelectionState as InteractionSelectionState
} from "@web-scada/interaction-engine";
import type { DesignerController, SelectionState } from "./contracts.js";

export function toDesignerSelection(state: Readonly<InteractionSelectionState>): SelectionState {
  return {
    selectedNodeIds: state.selection
      .filter((target) => target.kind === "node")
      .map((target) => target.id),
    selectedConnectionIds: state.selection
      .filter((target) => target.kind === "connection")
      .map((target) => target.id)
  };
}

export function toInteractionTargets(
  selection: Readonly<SelectionState>
): readonly InteractionTarget[] {
  return Object.freeze([
    ...selection.selectedNodeIds.map((id) => ({ id, kind: "node" as const })),
    ...selection.selectedConnectionIds.map((id) => ({
      id,
      kind: "connection" as const
    }))
  ]);
}

export class DesignerDocumentSelectionPolicy implements SelectionPolicy {
  readonly #nodes: ReadonlyMap<string, ScadaDocument["nodes"][number]>;
  readonly #connections: ReadonlySet<string>;
  readonly #layers: ReadonlyMap<string, ScadaDocument["layers"][number]>;
  public constructor(document: Readonly<ScadaDocument>) {
    this.#nodes = new Map(document.nodes.map((node) => [node.id, node]));
    this.#connections = new Set(document.connections.map(({ id }) => id));
    this.#layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  }
  public allows(target: Readonly<InteractionTarget>): boolean {
    if (target.kind === "node") {
      const node = this.#nodes.get(target.id);
      const layer = node === undefined ? undefined : this.#layers.get(node.layerId);
      return (
        node !== undefined &&
        node.visible &&
        !node.locked &&
        layer !== undefined &&
        layer.visible &&
        !layer.locked
      );
    }
    if (target.kind === "connection") return this.#connections.has(target.id);
    return true;
  }
}

export class DesignerSelectionBridge {
  readonly #unsubscribe: () => void;
  public constructor(
    private readonly designer: DesignerController,
    public readonly selection: SelectionManager
  ) {
    this.#unsubscribe = selection.subscribe(
      (event) => {
        this.designer.setSelection(toDesignerSelection(event.state));
      },
      { type: "selection-changed" }
    );
  }
  public syncFromDesigner(): boolean {
    return this.selection.replace(
      toInteractionTargets(this.designer.getState().selection),
      "programmatic"
    );
  }
  public dispose(): void {
    this.#unsubscribe();
  }
}
