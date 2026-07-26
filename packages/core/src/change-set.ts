export interface DocumentChangeSet {
  readonly addedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedConnectionIds: readonly string[];
  readonly updatedConnectionIds: readonly string[];
  readonly removedConnectionIds: readonly string[];
  readonly addedLayerIds: readonly string[];
  readonly updatedLayerIds: readonly string[];
  readonly removedLayerIds: readonly string[];
  readonly addedVariableIds: readonly string[];
  readonly updatedVariableIds: readonly string[];
  readonly removedVariableIds: readonly string[];
  readonly addedBindingIds: readonly string[];
  readonly updatedBindingIds: readonly string[];
  readonly removedBindingIds: readonly string[];
  readonly canvasChanged: boolean;
  readonly metadataChanged: boolean;
  readonly runtimeSettingsChanged: boolean;
}

export function createEmptyChangeSet(): DocumentChangeSet {
  return {
    addedNodeIds: [],
    updatedNodeIds: [],
    removedNodeIds: [],
    addedConnectionIds: [],
    updatedConnectionIds: [],
    removedConnectionIds: [],
    addedLayerIds: [],
    updatedLayerIds: [],
    removedLayerIds: [],
    addedVariableIds: [],
    updatedVariableIds: [],
    removedVariableIds: [],
    addedBindingIds: [],
    updatedBindingIds: [],
    removedBindingIds: [],
    canvasChanged: false,
    metadataChanged: false,
    runtimeSettingsChanged: false
  };
}

const entityKinds = ["Node", "Connection", "Layer", "Variable", "Binding"] as const;

function mergeEntity(
  kind: (typeof entityKinds)[number],
  sets: readonly DocumentChangeSet[],
  result: Record<string, readonly string[]>
): void {
  const addedKey = `added${kind}Ids` as keyof DocumentChangeSet;
  const updatedKey = `updated${kind}Ids` as keyof DocumentChangeSet;
  const removedKey = `removed${kind}Ids` as keyof DocumentChangeSet;
  const added = new Set<string>();
  const updated = new Set<string>();
  const removed = new Set<string>();
  for (const set of sets) {
    (set[addedKey] as readonly string[]).forEach((id) => {
      added.add(id);
    });
    (set[updatedKey] as readonly string[]).forEach((id) => {
      updated.add(id);
    });
    (set[removedKey] as readonly string[]).forEach((id) => {
      removed.add(id);
    });
  }
  removed.forEach((id) => {
    added.delete(id);
    updated.delete(id);
  });
  added.forEach((id) => updated.delete(id));
  result[addedKey] = [...added].sort();
  result[updatedKey] = [...updated].sort();
  result[removedKey] = [...removed].sort();
}

export function mergeChangeSets(...sets: readonly DocumentChangeSet[]): DocumentChangeSet {
  const base = createEmptyChangeSet();
  const arrays: Record<string, readonly string[]> = {};
  entityKinds.forEach((kind) => {
    mergeEntity(kind, sets, arrays);
  });
  return {
    ...base,
    ...arrays,
    canvasChanged: sets.some(({ canvasChanged }) => canvasChanged),
    metadataChanged: sets.some(({ metadataChanged }) => metadataChanged),
    runtimeSettingsChanged: sets.some(({ runtimeSettingsChanged }) => runtimeSettingsChanged)
  };
}

export function isChangeSetEmpty(changes: DocumentChangeSet): boolean {
  return (
    !changes.canvasChanged &&
    !changes.metadataChanged &&
    !changes.runtimeSettingsChanged &&
    entityKinds.every(
      (kind) =>
        (changes[`added${kind}Ids` as keyof DocumentChangeSet] as readonly string[]).length === 0 &&
        (changes[`updated${kind}Ids` as keyof DocumentChangeSet] as readonly string[]).length ===
          0 &&
        (changes[`removed${kind}Ids` as keyof DocumentChangeSet] as readonly string[]).length === 0
    )
  );
}
