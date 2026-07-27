export function stableDraggedIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(ids)].sort());
}
