import {
  SystemClock,
  UlidEntityIdGenerator,
  addConnection,
  addNode,
  removeConnection,
  removeNode,
  updateNode,
  type Clock,
  type Command,
  type CommandContext,
  type CommandResult,
  type EntityIdGenerator,
  type ScadaConnection,
  type ScadaDocument,
  type ScadaNode,
  type SymbolRegistry as CoreSymbolRegistry
} from "@web-scada/core";
import type { Point } from "@web-scada/geometry";
import type { NodeOrderOperation } from "./contracts.js";

export interface DesignerCommandDependencies {
  readonly clock?: Clock;
  readonly idGenerator?: EntityIdGenerator;
  readonly symbolRegistry?: CoreSymbolRegistry;
}

type DocumentOperation = (document: ScadaDocument) => ScadaDocument;

abstract class SnapshotCommand implements Command {
  public readonly id: string;
  public readonly timestamp: string;
  public readonly metadata: Readonly<Record<string, unknown>> = {};
  #before: ScadaDocument | undefined;
  #after: ScadaDocument | undefined;

  protected constructor(
    public readonly type: Command["type"],
    private readonly operation: DocumentOperation,
    dependencies: DesignerCommandDependencies = {}
  ) {
    const ids = dependencies.idGenerator ?? new UlidEntityIdGenerator();
    const clock = dependencies.clock ?? new SystemClock();
    this.id = ids.create("group");
    this.timestamp = clock.now();
  }

  public execute(context: CommandContext): CommandResult {
    this.#before = context.document;
    this.#after = this.operation(context.document);
    return { document: this.#after };
  }

  public undo(context: CommandContext): CommandResult {
    return { document: this.#before ?? context.document };
  }

  public redo(context: CommandContext): CommandResult {
    return { document: this.#after ?? this.operation(context.document) };
  }

  public canMergeWith(): boolean {
    return false;
  }
}

function mutationOptions(dependencies: DesignerCommandDependencies): DesignerCommandDependencies {
  return dependencies;
}

function successfulDocument(
  document: ScadaDocument,
  mutation: ReturnType<typeof updateNode>
): ScadaDocument {
  return mutation.success ? mutation.document : document;
}

export class InsertNodeCommand extends SnapshotCommand {
  public constructor(node: ScadaNode, dependencies: DesignerCommandDependencies = {}) {
    super(
      "add-node",
      (document) =>
        successfulDocument(document, addNode(document, node, mutationOptions(dependencies))),
      dependencies
    );
  }
}

export class MoveNodesCommand extends SnapshotCommand {
  public constructor(
    nodeIds: readonly string[],
    delta: Point,
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "move-node",
      (document) => {
        let next = document;
        for (const id of nodeIds)
          next = successfulDocument(
            next,
            updateNode(
              next,
              id,
              (node) => ({
                ...node,
                transform: {
                  ...node.transform,
                  x: node.transform.x + delta.x,
                  y: node.transform.y + delta.y
                }
              }),
              mutationOptions(dependencies)
            )
          );
        return next;
      },
      dependencies
    );
  }
}

export class ResizeNodeCommand extends SnapshotCommand {
  public constructor(
    nodeId: string,
    transform: ScadaNode["transform"],
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "resize-node",
      (document) =>
        successfulDocument(
          document,
          updateNode(
            document,
            nodeId,
            (node) => ({ ...node, transform }),
            mutationOptions(dependencies)
          )
        ),
      dependencies
    );
  }
}

export class UpdateNodeCommand extends SnapshotCommand {
  public constructor(
    nodeId: string,
    update: (node: ScadaNode) => ScadaNode,
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "update-property",
      (document) =>
        successfulDocument(
          document,
          updateNode(document, nodeId, update, mutationOptions(dependencies))
        ),
      dependencies
    );
  }
}

export class InsertConnectionCommand extends SnapshotCommand {
  public constructor(connection: ScadaConnection, dependencies: DesignerCommandDependencies = {}) {
    super(
      "create-connection",
      (document) =>
        successfulDocument(
          document,
          addConnection(document, connection, mutationOptions(dependencies))
        ),
      dependencies
    );
  }
}

export class DeleteEntitiesCommand extends SnapshotCommand {
  public constructor(
    nodeIds: readonly string[],
    connectionIds: readonly string[],
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "delete-node",
      (document) => {
        let next = document;
        for (const id of connectionIds) {
          const result = removeConnection(next, id, mutationOptions(dependencies));
          if (result.success) next = result.document;
        }
        for (const id of nodeIds) {
          const result = removeNode(next, id, mutationOptions(dependencies));
          if (result.success) next = result.document;
        }
        return next;
      },
      dependencies
    );
  }
}

export class InsertFragmentCommand extends SnapshotCommand {
  public constructor(
    nodes: readonly ScadaNode[],
    connections: readonly ScadaConnection[],
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "add-node",
      (document) => {
        let next = document;
        for (const node of nodes) {
          const result = addNode(next, node, mutationOptions(dependencies));
          if (result.success) next = result.document;
        }
        for (const connection of connections) {
          const result = addConnection(next, connection, mutationOptions(dependencies));
          if (result.success) next = result.document;
        }
        return next;
      },
      dependencies
    );
  }
}

export class ReorderNodesCommand extends SnapshotCommand {
  public constructor(
    nodeIds: readonly string[],
    operation: NodeOrderOperation,
    dependencies: DesignerCommandDependencies = {}
  ) {
    super(
      "update-property",
      (document) => {
        const selected = new Set(nodeIds);
        const nodes = [...document.nodes];
        if (operation === "front")
          return {
            ...document,
            nodes: [
              ...nodes.filter(({ id }) => !selected.has(id)),
              ...nodes.filter(({ id }) => selected.has(id))
            ]
          };
        if (operation === "back")
          return {
            ...document,
            nodes: [
              ...nodes.filter(({ id }) => selected.has(id)),
              ...nodes.filter(({ id }) => !selected.has(id))
            ]
          };
        const direction = operation === "forward" ? 1 : -1;
        const ordered = direction > 0 ? [...nodes.keys()].reverse() : [...nodes.keys()];
        for (const index of ordered) {
          const node = nodes[index];
          const swapIndex = index + direction;
          if (
            node !== undefined &&
            selected.has(node.id) &&
            swapIndex >= 0 &&
            swapIndex < nodes.length &&
            !selected.has(nodes[swapIndex]?.id ?? "")
          ) {
            const swapNode = nodes[swapIndex];
            if (swapNode !== undefined) {
              nodes[index] = swapNode;
              nodes[swapIndex] = node;
            }
          }
        }
        return { ...document, nodes };
      },
      dependencies
    );
  }
}
