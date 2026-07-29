import { describe, expect, it } from "vitest";
import type { SymbolDefinition } from "@web-scada/symbols";
import {
  DEFAULT_SYMBOL_LIBRARY_PREFERENCES,
  SYMBOL_LIBRARY_PREFERENCE_KEY,
  loadSymbolLibraryPreferences,
  normalizeSymbolLibrary,
  querySymbolLibrary,
  readSymbolDragData,
  recordRecent,
  symbolDisplayName,
  toggleFavorite,
  writeSymbolDragData,
  type StorageLike
} from "./symbol-library.js";

const definition = (
  type: string,
  category: string,
  aliases: readonly string[] = [],
  tags: readonly string[] = []
): SymbolDefinition => ({
  type,
  category,
  displayNameKey: type,
  defaultWidth: 80,
  defaultHeight: 60,
  minimumWidth: 20,
  minimumHeight: 20,
  ports: [],
  editableProperties: [],
  bindableProperties: [],
  supportedStates: ["normal"],
  aliases,
  tags
});

describe("symbol library presentation model", () => {
  const pumpDefinition = definition("pump.centrifugal", "pumps", ["legacy.pump"], ["water"]);
  const instrumentDefinition = {
    ...definition("instrument.pressure", "instruments"),
    metadata: { catalogName: "Pressure PI" }
  };
  const definitions = [pumpDefinition, definition("valve.gate", "valves"), instrumentDefinition];
  const categories = [
    { id: "pumps", displayName: "Pumps", order: 10 },
    { id: "valves", displayName: "Valves", order: 20 }
  ];
  const items = normalizeSymbolLibrary(definitions, categories);

  it("normalizes display and category fallbacks", () => {
    expect(symbolDisplayName(pumpDefinition)).toBe("Centrifugal");
    expect(symbolDisplayName(instrumentDefinition)).toBe("Pressure PI");
    expect(items[2]?.categoryName).toBe("instruments");
  });

  it("searches name, ID, category, alias, and tag with deterministic ranking", () => {
    expect(querySymbolLibrary(items, { query: "centrifugal" })[0]?.definition.type).toBe(
      "pump.centrifugal"
    );
    expect(querySymbolLibrary(items, { query: "legacy" })).toHaveLength(1);
    expect(querySymbolLibrary(items, { query: "water" })).toHaveLength(1);
    expect(querySymbolLibrary(items, { query: "valves" })).toHaveLength(1);
    expect(querySymbolLibrary(items, { category: "pumps", query: "pump" })).toHaveLength(1);
  });

  it("sorts and prioritizes favorites deterministically", () => {
    expect(
      querySymbolLibrary(items, { sort: "name-desc" }).map(({ displayName }) => displayName)
    ).toEqual(["Pressure PI", "Gate", "Centrifugal"]);
    expect(
      querySymbolLibrary(items, {
        favorites: new Set(["valve.gate"])
      })[0]?.definition.type
    ).toBe("valve.gate");
  });

  it("toggles favorites and bounds deduplicated recent IDs", () => {
    expect(toggleFavorite([], "pump.centrifugal")).toEqual(["pump.centrifugal"]);
    expect(toggleFavorite(["pump.centrifugal"], "pump.centrifugal")).toEqual([]);
    expect(recordRecent(["valve.gate", "pump.centrifugal"], "pump.centrifugal", 2)).toEqual([
      "pump.centrifugal",
      "valve.gate"
    ]);
  });

  it("recovers safely from invalid and obsolete preferences", () => {
    const values = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      }
    };
    values.set(SYMBOL_LIBRARY_PREFERENCE_KEY, "{bad");
    expect(loadSymbolLibraryPreferences(storage, new Set())).toBe(
      DEFAULT_SYMBOL_LIBRARY_PREFERENCES
    );
    values.set(
      SYMBOL_LIBRARY_PREFERENCE_KEY,
      JSON.stringify({
        version: 1,
        view: "invalid",
        sort: "name-asc",
        favorites: ["pump.centrifugal", "missing"],
        recent: ["missing", "valve.gate"]
      })
    );
    expect(
      loadSymbolLibraryPreferences(storage, new Set(["pump.centrifugal", "valve.gate"]))
    ).toEqual({
      version: 1,
      view: "grid",
      sort: "name-asc",
      favorites: ["pump.centrifugal"],
      recent: ["valve.gate"]
    });
  });

  it("writes and validates the stable drag payload", () => {
    const values = new Map<string, string>();
    const data = {
      types: ["application/x-web-scada-symbol-type"],
      getData: (type: string) => values.get(type) ?? "",
      setData: (type: string, value: string) => {
        values.set(type, value);
      }
    };
    writeSymbolDragData(data, "pump.centrifugal");
    expect(values.get("text/plain")).toBe("pump.centrifugal");
    expect(readSymbolDragData(data, new Set(["pump.centrifugal"]))).toBe("pump.centrifugal");
    expect(readSymbolDragData(data, new Set())).toBeUndefined();
  });
});
