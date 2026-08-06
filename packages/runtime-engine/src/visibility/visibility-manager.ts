import { resolveMotionPolicy, resolveVisibilityEntry } from "./resolvers.js";
import type {
  ContrastMode,
  MotionPreferenceInputs,
  RuntimeVisibilityDiagnostics,
  RuntimeVisibilityDiff,
  RuntimeVisibilityEntry,
  RuntimeVisibilitySnapshot,
  RuntimeVisibilityUpdate,
  VisibilityInput,
  VisibilityManagerOptions
} from "./types.js";

class VisibilityMap implements ReadonlyMap<string, RuntimeVisibilityEntry> {
  readonly #map: ReadonlyMap<string, RuntimeVisibilityEntry>;
  public constructor(entries: Iterable<readonly [string, RuntimeVisibilityEntry]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }
  public get size(): number {
    return this.#map.size;
  }
  public get(key: string): RuntimeVisibilityEntry | undefined {
    return this.#map.get(key);
  }
  public has(key: string): boolean {
    return this.#map.has(key);
  }
  public entries(): MapIterator<[string, RuntimeVisibilityEntry]> {
    return this.#map.entries();
  }
  public keys(): MapIterator<string> {
    return this.#map.keys();
  }
  public values(): MapIterator<RuntimeVisibilityEntry> {
    return this.#map.values();
  }
  public forEach(
    callback: (
      value: RuntimeVisibilityEntry,
      key: string,
      map: ReadonlyMap<string, RuntimeVisibilityEntry>
    ) => void
  ): void {
    this.#map.forEach((value, key) => {
      callback(value, key, this);
    });
  }
  public [Symbol.iterator](): MapIterator<[string, RuntimeVisibilityEntry]> {
    return this.#map[Symbol.iterator]();
  }
  public readonly [Symbol.toStringTag] = "ImmutableRuntimeVisibilityMap";
}

function sameInput(a: VisibilityInput | undefined, b: VisibilityInput): boolean {
  return (
    a?.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height &&
    a.viewport.x === b.viewport.x &&
    a.viewport.y === b.viewport.y &&
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height &&
    a.viewport.zoom === b.viewport.zoom &&
    a.explicitVisible === b.explicitVisible &&
    a.layerVisible === b.layerVisible &&
    a.groupVisible === b.groupVisible &&
    a.documentVisible === b.documentVisible &&
    a.collapsed === b.collapsed &&
    a.disabled === b.disabled &&
    a.occluded === b.occluded &&
    a.alarmPresentation === b.alarmPresentation
  );
}
function diagnostics(
  entries: ReadonlyMap<string, RuntimeVisibilityEntry>,
  motionPolicy: ReturnType<typeof resolveMotionPolicy>,
  contrastMode: ContrastMode,
  changedNodes: number
): RuntimeVisibilityDiagnostics {
  let visible = 0;
  let partial = 0;
  let paused = 0;
  let occluded = 0;
  let culled = 0;
  for (const entry of entries.values()) {
    if (entry.visibility === "visible") visible += 1;
    if (entry.visibility === "partially-visible") partial += 1;
    if (entry.permission.scheduler === "pause") paused += 1;
    if (entry.visibility === "occluded") occluded += 1;
    if (entry.optimization.cull) culled += 1;
  }
  return Object.freeze({
    totalSymbols: entries.size,
    visibleSymbols: visible,
    partiallyVisibleSymbols: partial,
    hiddenSymbols: entries.size - visible - partial,
    pausedAnimations: paused,
    runningAnimations: entries.size - paused,
    reducedMotionState: motionPolicy,
    contrastMode,
    culledSymbols: culled,
    occludedSymbols: occluded,
    changedNodes
  });
}
export class RuntimeVisibilityManager {
  readonly #now: () => number;
  readonly #inputs = new Map<string, VisibilityInput>();
  #motionInputs: MotionPreferenceInputs;
  #contrastMode: ContrastMode;
  #snapshot: RuntimeVisibilitySnapshot;
  public constructor(options: VisibilityManagerOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#motionInputs = Object.freeze({ ...(options.motion ?? {}) });
    this.#contrastMode = options.contrastMode ?? "normal";
    const policy = resolveMotionPolicy(this.#motionInputs);
    this.#snapshot = Object.freeze({
      revision: 0,
      timestamp: this.#validNow(),
      motionPolicy: policy,
      contrastMode: this.#contrastMode,
      entries: new VisibilityMap([]),
      diagnostics: diagnostics(new Map(), policy, this.#contrastMode, 0)
    });
  }
  public get snapshot(): RuntimeVisibilitySnapshot {
    return this.#snapshot;
  }
  public update(input: VisibilityInput): RuntimeVisibilityUpdate {
    return this.updateMany([input]);
  }
  public updateMany(inputs: readonly VisibilityInput[]): RuntimeVisibilityUpdate {
    const changed = new Set<string>();
    for (const input of inputs) {
      if (!input.entityId.trim()) throw new TypeError("Visibility entity ID is required.");
      const frozen = Object.freeze({
        ...input,
        bounds: Object.freeze({ ...input.bounds }),
        viewport: Object.freeze({ ...input.viewport })
      });
      if (!sameInput(this.#inputs.get(input.entityId), frozen)) {
        this.#inputs.set(input.entityId, frozen);
        changed.add(input.entityId);
      }
    }
    return this.#commit(changed, [], "entities");
  }
  public remove(entityId: string): RuntimeVisibilityUpdate {
    if (!this.#inputs.delete(entityId)) return { changed: false, snapshot: this.#snapshot };
    return this.#commit([], [entityId], "document");
  }
  public setViewport(viewport: VisibilityInput["viewport"]): RuntimeVisibilityUpdate {
    const changed: string[] = [];
    for (const [id, input] of this.#inputs)
      if (
        input.viewport.x !== viewport.x ||
        input.viewport.y !== viewport.y ||
        input.viewport.width !== viewport.width ||
        input.viewport.height !== viewport.height ||
        input.viewport.zoom !== viewport.zoom
      ) {
        this.#inputs.set(id, Object.freeze({ ...input, viewport: Object.freeze({ ...viewport }) }));
        changed.push(id);
      }
    return this.#commit(changed, [], "viewport");
  }
  public setMotionPreferences(inputs: MotionPreferenceInputs): RuntimeVisibilityUpdate {
    const previous = resolveMotionPolicy(this.#motionInputs);
    this.#motionInputs = Object.freeze({ ...inputs });
    if (resolveMotionPolicy(this.#motionInputs) === previous)
      return { changed: false, snapshot: this.#snapshot };
    return this.#commit(this.#inputs.keys(), [], "motion");
  }
  public setContrastMode(mode: ContrastMode): RuntimeVisibilityUpdate {
    if (mode === this.#contrastMode) return { changed: false, snapshot: this.#snapshot };
    this.#contrastMode = mode;
    return this.#commit(this.#inputs.keys(), [], "contrast");
  }
  #commit(
    changedValues: Iterable<string>,
    removedValues: Iterable<string>,
    reason: RuntimeVisibilityDiff["reason"]
  ): RuntimeVisibilityUpdate {
    const changed = [...new Set(changedValues)].sort();
    const removed = [...new Set(removedValues)].sort();
    if (changed.length === 0 && removed.length === 0)
      return { changed: false, snapshot: this.#snapshot };
    const entries = new Map(this.#snapshot.entries);
    const policy = resolveMotionPolicy(this.#motionInputs);
    for (const id of removed) entries.delete(id);
    for (const id of changed) {
      const input = this.#inputs.get(id);
      if (input !== undefined)
        entries.set(id, resolveVisibilityEntry(input, policy, this.#contrastMode));
    }
    const revision = this.#snapshot.revision + 1;
    const snapshot: RuntimeVisibilitySnapshot = Object.freeze({
      revision,
      timestamp: this.#validNow(),
      motionPolicy: policy,
      contrastMode: this.#contrastMode,
      entries: new VisibilityMap(entries),
      diagnostics: diagnostics(entries, policy, this.#contrastMode, changed.length + removed.length)
    });
    const diff: RuntimeVisibilityDiff = Object.freeze({
      fromRevision: this.#snapshot.revision,
      toRevision: revision,
      changedEntityIds: Object.freeze(changed),
      removedEntityIds: Object.freeze(removed),
      reason
    });
    this.#snapshot = snapshot;
    return { changed: true, snapshot, diff };
  }
  #validNow(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) throw new TypeError("Visibility clock must be finite.");
    return value;
  }
}
