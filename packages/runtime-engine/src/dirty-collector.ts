import type { RuntimeVisualSnapshotDiff } from "./contracts.js";

export type RuntimeDirtyCategory =
  | "NodeDirty"
  | "ConnectionDirty"
  | "AnimationDirty"
  | "AlarmDirty"
  | "LabelDirty"
  | "OverlayDirty"
  | "ViewportDirty";

export interface RuntimeDirtyState {
  readonly categories: ReadonlyMap<RuntimeDirtyCategory, readonly string[]>;
  readonly nodeIds: readonly string[];
  readonly connectionIds: readonly string[];
}

function sorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/** Collects renderer-neutral invalidations. It owns no DOM and performs no scheduling. */
export class RuntimeDirtyCollector {
  readonly #values = new Map<RuntimeDirtyCategory, Set<string>>();

  public add(category: RuntimeDirtyCategory, entityId: string): void {
    if (entityId.trim() === "") throw new TypeError("Dirty entityId is required.");
    const entries = this.#values.get(category) ?? new Set<string>();
    entries.add(entityId);
    this.#values.set(category, entries);
  }

  public addMany(category: RuntimeDirtyCategory, entityIds: Iterable<string>): void {
    for (const entityId of entityIds) this.add(category, entityId);
  }

  public addDiff(diff: RuntimeVisualSnapshotDiff): void {
    this.addMany("NodeDirty", [
      ...diff.addedNodeIds,
      ...diff.updatedNodeIds,
      ...diff.removedNodeIds
    ]);
    this.addMany("ConnectionDirty", [
      ...diff.addedConnectionIds,
      ...diff.updatedConnectionIds,
      ...diff.removedConnectionIds
    ]);
  }

  public clear(): void {
    this.#values.clear();
  }

  public snapshot(): RuntimeDirtyState {
    const categories = new Map<RuntimeDirtyCategory, readonly string[]>();
    for (const [category, ids] of this.#values) categories.set(category, sorted(ids));
    return Object.freeze({
      categories,
      nodeIds: categories.get("NodeDirty") ?? Object.freeze([]),
      connectionIds: categories.get("ConnectionDirty") ?? Object.freeze([])
    });
  }
}
