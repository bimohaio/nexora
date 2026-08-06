import type { AlarmSnapshot, AlarmSnapshotDiff, AlarmStatus } from "../alarm/types.js";
import { resolvePresentation } from "./alarm-visual-resolver.js";
import { DEFAULT_ALARM_THEME } from "./theme.js";
import type {
  AlarmMotionPreference,
  AlarmPresentation,
  AlarmTheme,
  AlarmVisualDiff,
  AlarmVisualSnapshot,
  AlarmVisualUpdate
} from "./types.js";

class ImmutablePresentationMap implements ReadonlyMap<string, AlarmPresentation> {
  readonly #map: ReadonlyMap<string, AlarmPresentation>;
  public constructor(entries: Iterable<readonly [string, AlarmPresentation]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }
  public get size(): number {
    return this.#map.size;
  }
  public get(key: string): AlarmPresentation | undefined {
    return this.#map.get(key);
  }
  public has(key: string): boolean {
    return this.#map.has(key);
  }
  public entries(): MapIterator<[string, AlarmPresentation]> {
    return this.#map.entries();
  }
  public keys(): MapIterator<string> {
    return this.#map.keys();
  }
  public values(): MapIterator<AlarmPresentation> {
    return this.#map.values();
  }
  public forEach(
    callback: (
      value: AlarmPresentation,
      key: string,
      map: ReadonlyMap<string, AlarmPresentation>
    ) => void
  ): void {
    this.#map.forEach((value, key) => {
      callback(value, key, this);
    });
  }
  public [Symbol.iterator](): MapIterator<[string, AlarmPresentation]> {
    return this.#map[Symbol.iterator]();
  }
  public readonly [Symbol.toStringTag] = "ImmutableAlarmPresentationMap";
}

const STATUS_PRESENTATION_RANK: Readonly<Record<string, number>> = Object.freeze({
  Disabled: 10,
  Offline: 9,
  Unknown: 8,
  Maintenance: 7,
  OutOfService: 6,
  Suppressed: 5,
  Shelved: 4,
  Acknowledged: 3,
  Active: 2,
  Normal: 1
});
function visualStatus(
  aggregateIds: readonly string[],
  snapshot: AlarmSnapshot,
  fallback: AlarmStatus
): AlarmStatus {
  let selected = fallback;
  for (const alarmId of aggregateIds) {
    const status = snapshot.alarms.get(alarmId)?.status;
    if (
      status !== undefined &&
      (STATUS_PRESENTATION_RANK[status] ?? 0) > (STATUS_PRESENTATION_RANK[selected] ?? 0)
    )
      selected = status;
  }
  return selected;
}
function emptyPresentation(): AlarmPresentation {
  return resolvePresentation({
    aggregate: Object.freeze({
      scope: "document",
      scopeId: "document",
      effectiveSeverity: "none",
      effectiveStatus: "Normal",
      alarmCount: 0,
      ackRequired: false,
      visual: Object.freeze({
        blink: false,
        flash: false,
        badge: false,
        overlay: "none",
        borderEmphasis: false,
        priorityToken: "alarm.none"
      }),
      alarmIds: Object.freeze([])
    }),
    revision: 0
  });
}
function immutableMap(
  entries: Iterable<readonly [string, AlarmPresentation]>
): ReadonlyMap<string, AlarmPresentation> {
  return new ImmutablePresentationMap(entries);
}
function sorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

export class AlarmVisualResolver {
  public resolve(options: Parameters<typeof resolvePresentation>[0]): AlarmPresentation {
    return resolvePresentation(options);
  }
}

/** Incremental presentation projection. It consumes resolved alarms and never evaluates conditions or severity. */
export class AlarmVisualPresentationStore {
  readonly #resolver: AlarmVisualResolver;
  #theme: AlarmTheme;
  #motion: AlarmMotionPreference;
  #alarmSnapshot: AlarmSnapshot | undefined;
  #snapshot: AlarmVisualSnapshot;

  public constructor(
    options: {
      readonly theme?: AlarmTheme;
      readonly motionPreference?: AlarmMotionPreference;
      readonly resolver?: AlarmVisualResolver;
      readonly now?: () => number;
    } = {}
  ) {
    this.#theme = options.theme ?? DEFAULT_ALARM_THEME;
    this.#motion = options.motionPreference ?? "no-preference";
    this.#resolver = options.resolver ?? new AlarmVisualResolver();
    const now = options.now?.() ?? Date.now();
    this.#snapshot = Object.freeze({
      revision: 0,
      alarmRevision: 0,
      timestamp: now,
      themeId: this.#theme.id,
      motionPreference: this.#motion,
      symbols: immutableMap([]),
      connections: immutableMap([]),
      groups: immutableMap([]),
      layers: immutableMap([]),
      document: emptyPresentation()
    });
  }
  public get snapshot(): AlarmVisualSnapshot {
    return this.#snapshot;
  }

  public apply(alarmSnapshot: AlarmSnapshot, diff?: AlarmSnapshotDiff): AlarmVisualUpdate {
    if (this.#alarmSnapshot !== undefined && alarmSnapshot.revision < this.#alarmSnapshot.revision)
      return { changed: false, snapshot: this.#snapshot };
    this.#alarmSnapshot = alarmSnapshot;
    const reset = diff?.fromRevision !== this.#snapshot.alarmRevision;
    const symbolIds = reset ? [...alarmSnapshot.symbols.keys()] : diff.changedSymbolIds;
    const connectionIds = reset ? [...alarmSnapshot.connections.keys()] : diff.changedConnectionIds;
    const groupIds = reset ? [...alarmSnapshot.groups.keys()] : diff.changedGroupIds;
    const layerIds = reset ? [...alarmSnapshot.layers.keys()] : diff.changedLayerIds;
    return this.#commit(
      alarmSnapshot,
      symbolIds,
      connectionIds,
      groupIds,
      layerIds,
      reset || diff.documentChanged,
      "alarm"
    );
  }

  public setTheme(theme: AlarmTheme): AlarmVisualUpdate {
    if (!theme.id.trim()) throw new TypeError("Alarm theme ID must not be empty.");
    if (theme === this.#theme) return { changed: false, snapshot: this.#snapshot };
    this.#theme = Object.freeze({
      ...theme,
      ...(theme.tokens === undefined ? {} : { tokens: Object.freeze({ ...theme.tokens }) })
    });
    return this.#reprojectAll("theme");
  }
  public setMotionPreference(motionPreference: AlarmMotionPreference): AlarmVisualUpdate {
    if (motionPreference === this.#motion) return { changed: false, snapshot: this.#snapshot };
    this.#motion = motionPreference;
    return this.#reprojectAll("motion");
  }

  #reprojectAll(reason: "theme" | "motion"): AlarmVisualUpdate {
    const alarmSnapshot = this.#alarmSnapshot;
    if (alarmSnapshot === undefined) return { changed: false, snapshot: this.#snapshot };
    return this.#commit(
      alarmSnapshot,
      [...alarmSnapshot.symbols.keys()],
      [...alarmSnapshot.connections.keys()],
      [...alarmSnapshot.groups.keys()],
      [...alarmSnapshot.layers.keys()],
      true,
      reason
    );
  }
  #commit(
    alarmSnapshot: AlarmSnapshot,
    symbolIds: readonly string[],
    connectionIds: readonly string[],
    groupIds: readonly string[],
    layerIds: readonly string[],
    documentChanged: boolean,
    reason: AlarmVisualDiff["reason"]
  ): AlarmVisualUpdate {
    const symbols = this.#resolveMap(
      this.#snapshot.symbols,
      alarmSnapshot.symbols,
      symbolIds,
      alarmSnapshot
    );
    const connections = this.#resolveMap(
      this.#snapshot.connections,
      alarmSnapshot.connections,
      connectionIds,
      alarmSnapshot
    );
    const groups = this.#resolveMap(
      this.#snapshot.groups,
      alarmSnapshot.groups,
      groupIds,
      alarmSnapshot
    );
    const layers = this.#resolveMap(
      this.#snapshot.layers,
      alarmSnapshot.layers,
      layerIds,
      alarmSnapshot
    );
    const revision = this.#snapshot.revision + 1;
    const document = documentChanged
      ? this.#resolver.resolve({
          aggregate: alarmSnapshot.document,
          revision,
          theme: this.#theme,
          motionPreference: this.#motion,
          statusOverride: visualStatus(
            alarmSnapshot.document.alarmIds,
            alarmSnapshot,
            alarmSnapshot.document.effectiveStatus
          )
        })
      : this.#snapshot.document;
    const next: AlarmVisualSnapshot = Object.freeze({
      revision,
      alarmRevision: alarmSnapshot.revision,
      timestamp: alarmSnapshot.timestamp,
      themeId: this.#theme.id,
      motionPreference: this.#motion,
      symbols,
      connections,
      groups,
      layers,
      document
    });
    const diff: AlarmVisualDiff = Object.freeze({
      fromRevision: this.#snapshot.revision,
      toRevision: revision,
      changedSymbolIds: sorted(symbolIds),
      changedConnectionIds: sorted(connectionIds),
      changedGroupIds: sorted(groupIds),
      changedLayerIds: sorted(layerIds),
      documentChanged,
      reason
    });
    this.#snapshot = next;
    return { changed: true, snapshot: next, diff };
  }
  #resolveMap(
    previous: ReadonlyMap<string, AlarmPresentation>,
    aggregates: AlarmSnapshot["symbols"],
    changedIds: readonly string[],
    alarmSnapshot: AlarmSnapshot
  ): ReadonlyMap<string, AlarmPresentation> {
    const result = new Map(previous);
    const revision = this.#snapshot.revision + 1;
    for (const id of changedIds) {
      const aggregate = aggregates.get(id);
      if (aggregate === undefined) result.delete(id);
      else
        result.set(
          id,
          this.#resolver.resolve({
            aggregate,
            revision,
            theme: this.#theme,
            motionPreference: this.#motion,
            statusOverride: visualStatus(
              aggregate.alarmIds,
              alarmSnapshot,
              aggregate.effectiveStatus
            )
          })
        );
    }
    return immutableMap(result);
  }
}
