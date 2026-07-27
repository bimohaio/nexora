import type { ScadaDocument } from "@web-scada/core";
import {
  DragEngine,
  HiddenLayerConstraint,
  LockedNodeConstraint,
  MinimumMovementConstraint,
  MovablePolicy,
  ReadOnlyConstraint,
  type DragDiagnostics,
  type DragPreviewAdapter
} from "@web-scada/interaction-engine";
import { MoveNodesCommand, type DesignerCommandDependencies } from "./commands.js";

export interface DesignerDragEngineOptions {
  readonly getDocument: () => Readonly<ScadaDocument>;
  readonly commandDependencies?: DesignerCommandDependencies;
  readonly preview?: DragPreviewAdapter;
  readonly diagnostics?: DragDiagnostics;
  readonly minimumMovement?: number;
  readonly readOnly?: boolean;
}

export function createDesignerDragEngine(options: DesignerDragEngineOptions): DragEngine {
  return new DragEngine({
    nodes: (ids) => {
      const document = options.getDocument();
      const wanted = new Set(ids);
      return document.nodes
        .filter(({ id }) => wanted.has(id))
        .map(({ id, transform, locked, visible, layerId }) => ({
          id,
          position: { x: transform.x, y: transform.y },
          locked,
          visible,
          layerId
        }));
    },
    commandFactory: {
      create: (ids, delta) => new MoveNodesCommand(ids, delta, options.commandDependencies)
    },
    policies: [new MovablePolicy()],
    constraints: [
      new MinimumMovementConstraint(options.minimumMovement ?? 3),
      new LockedNodeConstraint(),
      new HiddenLayerConstraint((layerId) => {
        const layer = options.getDocument().layers.find(({ id }) => id === layerId);
        return layer?.visible !== false && layer?.locked !== true;
      }),
      new ReadOnlyConstraint()
    ],
    ...(options.preview === undefined ? {} : { preview: options.preview }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly })
  });
}
