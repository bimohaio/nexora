import type {
  AlarmPresentation,
  AlarmVisualDiff,
  AlarmVisualSnapshot
} from "../alarm-visual/types.js";
import { DEFAULT_OVERLAY_THEME, resolveOverlayStack } from "./overlay-resolver.js";
import type {
  OverlayDiff,
  OverlaySnapshot,
  OverlayStack,
  OverlayStoreOptions,
  OverlayTheme,
  OverlayUpdate
} from "./types.js";

function immutable(
  entries: Iterable<readonly [string, OverlayStack]>
): ReadonlyMap<string, OverlayStack> {
  return new Map(entries);
}
function ids(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}
function emptyStack(): OverlayStack {
  return Object.freeze({
    entityId: "document",
    scope: "document",
    layers: Object.freeze([]),
    maximumCount: 8,
    truncated: false
  });
}
export class AlarmOverlayStore {
  #theme: OverlayTheme;
  #motion;
  #enabled;
  #maximumCount;
  #source: AlarmVisualSnapshot | undefined;
  #snapshot: OverlaySnapshot;
  public constructor(options: OverlayStoreOptions = {}) {
    this.#theme = options.theme ?? DEFAULT_OVERLAY_THEME;
    this.#motion = options.motionPreference ?? "no-preference";
    this.#enabled = options.enabled ?? true;
    this.#maximumCount = options.maximumCount ?? 8;
    this.#snapshot = Object.freeze({
      revision: 0,
      presentationRevision: 0,
      timestamp: options.now?.() ?? Date.now(),
      themeId: this.#theme.id,
      motionPreference: this.#motion,
      symbols: immutable([]),
      connections: immutable([]),
      groups: immutable([]),
      layers: immutable([]),
      document: emptyStack()
    });
  }
  public get snapshot(): OverlaySnapshot {
    return this.#snapshot;
  }
  public apply(source: AlarmVisualSnapshot, diff?: AlarmVisualDiff): OverlayUpdate {
    if (this.#source !== undefined && source.revision < this.#source.revision)
      return { changed: false, snapshot: this.#snapshot };
    this.#source = source;
    const reset = diff?.fromRevision !== this.#snapshot.presentationRevision;
    return this.#commit(
      source,
      reset ? [...source.symbols.keys()] : diff.changedSymbolIds,
      reset ? [...source.connections.keys()] : diff.changedConnectionIds,
      reset ? [...source.groups.keys()] : diff.changedGroupIds,
      reset ? [...source.layers.keys()] : diff.changedLayerIds,
      reset || diff.documentChanged,
      "presentation"
    );
  }
  public setTheme(theme: OverlayTheme): OverlayUpdate {
    if (!theme.id.trim()) throw new TypeError("Overlay theme ID is required.");
    if (theme === this.#theme) return { changed: false, snapshot: this.#snapshot };
    this.#theme = Object.freeze({
      ...theme,
      ...(theme.tokens === undefined ? {} : { tokens: Object.freeze({ ...theme.tokens }) })
    });
    return this.#all("theme");
  }
  public setMotionPreference(value: "reduce" | "no-preference"): OverlayUpdate {
    if (value === this.#motion) return { changed: false, snapshot: this.#snapshot };
    this.#motion = value;
    return this.#all("motion");
  }
  public setEnabled(value: boolean): OverlayUpdate {
    if (value === this.#enabled) return { changed: false, snapshot: this.#snapshot };
    this.#enabled = value;
    return this.#all("policy");
  }
  #all(reason: OverlayDiff["reason"]): OverlayUpdate {
    const source = this.#source;
    return source === undefined
      ? { changed: false, snapshot: this.#snapshot }
      : this.#commit(
          source,
          [...source.symbols.keys()],
          [...source.connections.keys()],
          [...source.groups.keys()],
          [...source.layers.keys()],
          true,
          reason
        );
  }
  #map(
    previous: ReadonlyMap<string, OverlayStack>,
    presentations: ReadonlyMap<string, AlarmPresentation>,
    changed: readonly string[]
  ): ReadonlyMap<string, OverlayStack> {
    const next = new Map(previous);
    for (const id of changed) {
      const presentation = presentations.get(id);
      if (presentation === undefined) next.delete(id);
      else
        next.set(
          id,
          resolveOverlayStack({
            presentation,
            theme: this.#theme,
            motionPreference: this.#motion,
            enabled: this.#enabled,
            maximumCount: this.#maximumCount
          })
        );
    }
    return immutable(next);
  }
  #commit(
    source: AlarmVisualSnapshot,
    symbolIds: readonly string[],
    connectionIds: readonly string[],
    groupIds: readonly string[],
    layerIds: readonly string[],
    documentChanged: boolean,
    reason: OverlayDiff["reason"]
  ): OverlayUpdate {
    const revision = this.#snapshot.revision + 1;
    const next: OverlaySnapshot = Object.freeze({
      revision,
      presentationRevision: source.revision,
      timestamp: source.timestamp,
      themeId: this.#theme.id,
      motionPreference: this.#motion,
      symbols: this.#map(this.#snapshot.symbols, source.symbols, symbolIds),
      connections: this.#map(this.#snapshot.connections, source.connections, connectionIds),
      groups: this.#map(this.#snapshot.groups, source.groups, groupIds),
      layers: this.#map(this.#snapshot.layers, source.layers, layerIds),
      document: documentChanged
        ? resolveOverlayStack({
            presentation: source.document,
            theme: this.#theme,
            motionPreference: this.#motion,
            enabled: this.#enabled,
            maximumCount: this.#maximumCount
          })
        : this.#snapshot.document
    });
    const diff: OverlayDiff = Object.freeze({
      fromRevision: this.#snapshot.revision,
      toRevision: revision,
      changedSymbolIds: ids(symbolIds),
      changedConnectionIds: ids(connectionIds),
      changedGroupIds: ids(groupIds),
      changedLayerIds: ids(layerIds),
      documentChanged,
      reason
    });
    this.#snapshot = next;
    return { changed: true, snapshot: next, diff };
  }
}
