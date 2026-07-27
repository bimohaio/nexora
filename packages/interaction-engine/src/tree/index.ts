import { AccessibilityError } from "../errors/index.js";
import type {
  AccessibilityNode,
  AccessibilityPolicy,
  AccessibilityTreeState
} from "../types/accessibility.js";

export interface AccessibilityTreeUpdate {
  readonly upsert?: readonly AccessibilityNode[];
  readonly remove?: readonly string[];
}
export interface AccessibilityTreeUpdateResult {
  readonly state: AccessibilityTreeState;
  readonly changedIds: readonly string[];
  readonly removedIds: readonly string[];
}

function freezeNode(node: AccessibilityNode): AccessibilityNode {
  return Object.freeze({
    ...node,
    children: Object.freeze([...node.children]),
    state: Object.freeze({ ...node.state }),
    properties: Object.freeze({ ...node.properties })
  });
}

function sameNode(left: AccessibilityNode | undefined, right: AccessibilityNode): boolean {
  return (
    left?.id === right.id &&
    left.parent === right.parent &&
    left.role === right.role &&
    left.label === right.label &&
    left.description === right.description &&
    left.visible === right.visible &&
    left.focusable === right.focusable &&
    JSON.stringify(left.children) === JSON.stringify(right.children) &&
    JSON.stringify(left.state) === JSON.stringify(right.state) &&
    JSON.stringify(left.properties) === JSON.stringify(right.properties)
  );
}

export class AccessibilityTree {
  #state: AccessibilityTreeState = Object.freeze({
    roots: Object.freeze([]),
    nodes: new Map(),
    revision: 0
  });
  #disposed = false;
  public get state(): AccessibilityTreeState {
    return this.#state;
  }
  public replace(
    nodes: readonly AccessibilityNode[],
    policies: readonly AccessibilityPolicy[] = [],
    readOnly = false
  ): AccessibilityTreeUpdateResult {
    this.#assertUsable();
    const allowed = nodes.filter((node) =>
      policies.every((policy) => policy.includes(node, { readOnly }))
    );
    const allowedIds = new Set(allowed.map(({ id }) => id));
    let removedOrphan = true;
    while (removedOrphan) {
      removedOrphan = false;
      for (const node of allowed)
        if (allowedIds.has(node.id) && node.parent !== undefined && !allowedIds.has(node.parent)) {
          allowedIds.delete(node.id);
          removedOrphan = true;
        }
    }
    const previousIds = new Set(this.#state.nodes.keys());
    const next = new Map<string, AccessibilityNode>();
    const changed: string[] = [];
    for (const input of allowed) {
      if (!allowedIds.has(input.id)) continue;
      if (next.has(input.id))
        throw new AccessibilityError(
          "ACCESSIBILITY_NODE_DUPLICATE",
          `Duplicate accessibility node: ${input.id}`
        );
      const frozen = freezeNode({
        ...input,
        children: input.children.filter((id) => allowedIds.has(id))
      });
      const previous = this.#state.nodes.get(input.id);
      const unchanged = sameNode(previous, frozen);
      next.set(input.id, unchanged && previous !== undefined ? previous : frozen);
      if (!unchanged) changed.push(input.id);
      previousIds.delete(input.id);
    }
    this.#validate(next);
    const roots = Object.freeze(
      [...next.values()].filter(({ parent }) => parent === undefined).map(({ id }) => id)
    );
    this.#state = Object.freeze({
      roots,
      nodes: next,
      revision: this.#state.revision + 1
    });
    return {
      state: this.#state,
      changedIds: Object.freeze(changed),
      removedIds: Object.freeze([...previousIds])
    };
  }
  public update(update: AccessibilityTreeUpdate): AccessibilityTreeUpdateResult {
    this.#assertUsable();
    const next = new Map(this.#state.nodes);
    const changed: string[] = [];
    const removed = new Set(update.remove ?? []);
    for (const id of removed) next.delete(id);
    for (const input of update.upsert ?? []) {
      const frozen = freezeNode(input);
      if (!sameNode(next.get(input.id), frozen)) {
        next.set(input.id, frozen);
        changed.push(input.id);
      }
    }
    for (const [id, node] of next)
      if (node.parent !== undefined && removed.has(node.parent)) {
        next.delete(id);
        removed.add(id);
      }
    this.#validate(next);
    this.#state = Object.freeze({
      roots: Object.freeze(
        [...next.values()].filter(({ parent }) => parent === undefined).map(({ id }) => id)
      ),
      nodes: next,
      revision: this.#state.revision + 1
    });
    return {
      state: this.#state,
      changedIds: Object.freeze(changed),
      removedIds: Object.freeze([...removed])
    };
  }
  public dispose(): void {
    this.#state = Object.freeze({
      roots: Object.freeze([]),
      nodes: new Map(),
      revision: this.#state.revision + 1
    });
    this.#disposed = true;
  }
  #validate(nodes: ReadonlyMap<string, AccessibilityNode>): void {
    for (const node of nodes.values()) {
      if (node.parent !== undefined && !nodes.has(node.parent))
        throw new AccessibilityError(
          "ACCESSIBILITY_PARENT_MISSING",
          `Parent not found for ${node.id}: ${node.parent}`
        );
      for (const child of node.children)
        if (nodes.get(child)?.parent !== node.id)
          throw new AccessibilityError(
            "ACCESSIBILITY_TREE_INVALID",
            `Child relationship is invalid: ${node.id} -> ${child}`
          );
    }
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new AccessibilityError("ACCESSIBILITY_DISPOSED", "Accessibility tree is disposed.");
  }
}
