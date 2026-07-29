import type { SymbolCategoryDefinition, SymbolDefinition } from "@web-scada/symbols";

export type SymbolLibraryView = "grid" | "list";
export type SymbolLibrarySort = "default" | "name-asc" | "name-desc";

export interface SymbolLibraryItem {
  readonly definition: SymbolDefinition;
  readonly displayName: string;
  readonly categoryName: string;
  readonly categoryOrder: number;
  readonly registryOrder: number;
  readonly searchValues: readonly string[];
}

export interface SymbolLibraryPreferences {
  readonly version: 1;
  readonly view: SymbolLibraryView;
  readonly sort: SymbolLibrarySort;
  readonly favorites: readonly string[];
  readonly recent: readonly string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SYMBOL_LIBRARY_PREFERENCE_KEY = "nexora.symbol-library.v1";
export const SYMBOL_LIBRARY_DRAG_TYPE = "application/x-web-scada-symbol-type";
export const DEFAULT_SYMBOL_LIBRARY_PREFERENCES: SymbolLibraryPreferences = Object.freeze({
  version: 1,
  view: "grid",
  sort: "default",
  favorites: Object.freeze([]),
  recent: Object.freeze([])
});

export function symbolDisplayName(definition: SymbolDefinition): string {
  const metadataName = definition.metadata?.catalogName;
  if (typeof metadataName === "string" && metadataName.trim() !== "") return metadataName;
  const source = definition.type.slice(definition.type.lastIndexOf(".") + 1);
  return source
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeSymbolLibrary(
  definitions: readonly SymbolDefinition[],
  categories: readonly SymbolCategoryDefinition[]
): readonly SymbolLibraryItem[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return Object.freeze(
    definitions.map((definition, registryOrder) => {
      const category = categoryById.get(definition.category);
      const displayName = symbolDisplayName(definition);
      const categoryName = (category?.displayName ?? definition.category) || "Other";
      return Object.freeze({
        definition,
        displayName,
        categoryName,
        categoryOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
        registryOrder,
        searchValues: Object.freeze([
          displayName.toLocaleLowerCase(),
          definition.type.toLocaleLowerCase(),
          categoryName.toLocaleLowerCase(),
          definition.category.toLocaleLowerCase(),
          ...(definition.aliases ?? []).map((value) => value.toLocaleLowerCase()),
          ...(definition.tags ?? []).map((value) => value.toLocaleLowerCase())
        ])
      });
    })
  );
}

function searchRank(item: SymbolLibraryItem, query: string): number {
  const name = item.displayName.toLocaleLowerCase();
  const type = item.definition.type.toLocaleLowerCase();
  if (name === query) return 0;
  if (type === query) return 1;
  if (name.startsWith(query)) return 2;
  if (type.startsWith(query)) return 3;
  if (item.searchValues.slice(4).some((value) => value.includes(query))) return 4;
  return 5;
}

export function querySymbolLibrary(
  items: readonly SymbolLibraryItem[],
  options: {
    readonly query?: string;
    readonly category?: string;
    readonly sort?: SymbolLibrarySort;
    readonly favorites?: ReadonlySet<string>;
  } = {}
): readonly SymbolLibraryItem[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const filtered = items.filter(
    (item) =>
      (options.category === undefined ||
        options.category === "" ||
        item.definition.category === options.category) &&
      (query === "" || item.searchValues.some((value) => value.includes(query)))
  );
  return Object.freeze(
    [...filtered].sort((left, right) => {
      if (options.favorites !== undefined) {
        const favoriteOrder =
          Number(options.favorites.has(right.definition.type)) -
          Number(options.favorites.has(left.definition.type));
        if (favoriteOrder !== 0) return favoriteOrder;
      }
      if (query !== "") {
        const rank = searchRank(left, query) - searchRank(right, query);
        if (rank !== 0) return rank;
      }
      if (options.sort === "name-asc")
        return (
          left.displayName.localeCompare(right.displayName) ||
          left.definition.type.localeCompare(right.definition.type)
        );
      if (options.sort === "name-desc")
        return (
          right.displayName.localeCompare(left.displayName) ||
          left.definition.type.localeCompare(right.definition.type)
        );
      return left.registryOrder - right.registryOrder;
    })
  );
}

function stringArray(value: unknown, knownTypes: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(
    [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].filter(
      (type) => knownTypes.has(type)
    )
  );
}

export function loadSymbolLibraryPreferences(
  storage: StorageLike | undefined,
  knownTypes: ReadonlySet<string>
): SymbolLibraryPreferences {
  if (storage === undefined) return DEFAULT_SYMBOL_LIBRARY_PREFERENCES;
  try {
    const raw = storage.getItem(SYMBOL_LIBRARY_PREFERENCE_KEY);
    if (raw === null) return DEFAULT_SYMBOL_LIBRARY_PREFERENCES;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1) return DEFAULT_SYMBOL_LIBRARY_PREFERENCES;
    return Object.freeze({
      version: 1,
      view: value.view === "list" ? "list" : "grid",
      sort: value.sort === "name-asc" || value.sort === "name-desc" ? value.sort : "default",
      favorites: stringArray(value.favorites, knownTypes),
      recent: stringArray(value.recent, knownTypes).slice(0, 10)
    });
  } catch {
    return DEFAULT_SYMBOL_LIBRARY_PREFERENCES;
  }
}

export function saveSymbolLibraryPreferences(
  storage: StorageLike | undefined,
  preferences: SymbolLibraryPreferences
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(SYMBOL_LIBRARY_PREFERENCE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function toggleFavorite(favorites: readonly string[], type: string): readonly string[] {
  return favorites.includes(type)
    ? Object.freeze(favorites.filter((value) => value !== type))
    : Object.freeze([...favorites, type]);
}

export function recordRecent(
  recent: readonly string[],
  type: string,
  limit = 10
): readonly string[] {
  return Object.freeze([type, ...recent.filter((value) => value !== type)].slice(0, limit));
}

export interface SymbolDragData {
  readonly types: readonly string[];
  setData(type: string, value: string): void;
  getData(type: string): string;
}

export function writeSymbolDragData(data: SymbolDragData, type: string): void {
  data.setData(SYMBOL_LIBRARY_DRAG_TYPE, type);
  data.setData("text/plain", type);
}

export function readSymbolDragData(
  data: Pick<SymbolDragData, "types" | "getData">,
  knownTypes: ReadonlySet<string>
): string | undefined {
  if (!data.types.includes(SYMBOL_LIBRARY_DRAG_TYPE)) return undefined;
  const type = data.getData(SYMBOL_LIBRARY_DRAG_TYPE);
  return knownTypes.has(type) ? type : undefined;
}
