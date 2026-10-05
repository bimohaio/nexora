import {
  DeterministicIdGenerator,
  FixedClock,
  createScadaDocument,
  type Command,
  type CommandContext,
  type CommandResult,
  type ScadaDocument
} from "@web-scada/core";
import { describe, expect, it } from "vitest";
import type { HistoryCostEstimator } from "./contracts.js";
import { HistoryEngine } from "./engine.js";
import { HistoryError } from "./error.js";

function document(name = "Initial"): ScadaDocument {
  return createScadaDocument({
    name,
    idGenerator: new DeterministicIdGenerator(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z")
  });
}

function rename(name: string): Command {
  let before: ScadaDocument | undefined;
  let after: ScadaDocument | undefined;
  return {
    id: `rename-${name}`,
    type: "update-property",
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
    execute(context: CommandContext): CommandResult {
      before = context.document;
      after = { ...context.document, metadata: { ...context.document.metadata, name } };
      return { document: after };
    },
    undo(context: CommandContext): CommandResult {
      return { document: before ?? context.document };
    },
    redo(context: CommandContext): CommandResult {
      return { document: after ?? context.document };
    },
    canMergeWith(): boolean {
      return false;
    }
  };
}

const fortyBytes: HistoryCostEstimator = { estimate: () => 40 };

describe("HistoryEngine retention", () => {
  it("prunes multiple oldest logical entries and reports immutable statistics", () => {
    const history = new HistoryEngine({ maxEntries: 2, costEstimator: fortyBytes });
    let current = document();
    for (const name of ["A", "B", "C", "D"]) current = history.execute(rename(name), current);
    expect(history.retentionStatistics).toEqual({
      undoEntries: 2,
      redoEntries: 0,
      estimatedUndoBytes: 80,
      estimatedRedoBytes: 0,
      estimatedBytes: 80,
      totalPrunedEntries: 2,
      totalDiscardedRedoEntries: 0,
      costEstimationFailureCount: 0
    });
    expect(Object.isFrozen(history.retentionStatistics)).toBe(true);
    current = history.undo(current);
    expect(current.metadata.name).toBe("C");
    current = history.undo(current);
    expect(current.metadata.name).toBe("B");
    expect(history.executeUndo(current).status).toBe("not-available");
  });

  it("enforces a deterministic estimated-byte budget oldest first", () => {
    const history = new HistoryEngine({
      maxEntries: 10,
      maxEstimatedBytes: 100,
      costEstimator: fortyBytes
    });
    let current = document();
    for (const name of ["A", "B", "C"]) current = history.execute(rename(name), current);
    expect(history.retentionStatistics).toMatchObject({
      undoEntries: 2,
      estimatedBytes: 80,
      totalPrunedEntries: 1
    });
    expect(history.undo(history.undo(current)).metadata.name).toBe("A");
  });

  it("retains and diagnoses a newest oversized atomic transaction", () => {
    const history = new HistoryEngine({
      maxEstimatedBytes: 10,
      costEstimator: { estimate: (entry) => entry.operations.length * 20 }
    });
    const transaction = history.beginTransaction();
    const initial = document();
    const a = history.execute(rename("A"), initial);
    const final = history.execute(rename("B"), a);
    const result = transaction.commit();
    expect(result.entry?.operations).toHaveLength(2);
    expect(result.entry?.diagnostics).toContainEqual(
      expect.objectContaining({ code: "HISTORY_OVERSIZED_ENTRY_RETAINED" })
    );
    expect(history.retentionStatistics).toMatchObject({ undoEntries: 1, estimatedBytes: 40 });
    expect(history.undo(final)).toBe(initial);
  });

  it("releases redo accounting immediately on a divergent branch", () => {
    const history = new HistoryEngine({ costEstimator: fortyBytes });
    const initial = document();
    const a = history.execute(rename("A"), initial);
    const b = history.execute(rename("B"), a);
    const c = history.execute(rename("C"), b);
    const afterUndo = history.undo(history.undo(c));
    expect(history.retentionStatistics).toMatchObject({
      undoEntries: 1,
      redoEntries: 2,
      estimatedUndoBytes: 40,
      estimatedRedoBytes: 80
    });
    history.execute(rename("D"), afterUndo);
    expect(history.retentionStatistics).toMatchObject({
      undoEntries: 2,
      redoEntries: 0,
      estimatedBytes: 80,
      totalDiscardedRedoEntries: 2
    });
  });

  it("fails estimation safely and validates byte-budget configuration", () => {
    expect(() => new HistoryEngine({ maxEstimatedBytes: 1 })).toThrowError(HistoryError);
    expect(
      () => new HistoryEngine({ maxEstimatedBytes: Number.NaN, costEstimator: fortyBytes })
    ).toThrowError(HistoryError);
    const history = new HistoryEngine({
      maxEstimatedBytes: 1,
      costEstimator: { estimate: () => Number.POSITIVE_INFINITY }
    });
    const entry = history.record({
      command: rename("A"),
      before: document(),
      after: document("A")
    });
    expect(entry?.diagnostics).toContainEqual(
      expect.objectContaining({ code: "HISTORY_COST_ESTIMATION_FAILED" })
    );
    expect(history.retentionStatistics).toMatchObject({
      estimatedBytes: 0,
      costEstimationFailureCount: 1
    });
  });

  it("resets retained accounting on clear and all accounting on dispose", () => {
    const history = new HistoryEngine({ maxEntries: 1, costEstimator: fortyBytes });
    const initial = document();
    const a = history.execute(rename("A"), initial);
    history.execute(rename("B"), a);
    history.clear();
    expect(history.retentionStatistics).toMatchObject({ undoEntries: 0, estimatedBytes: 0 });
    history.dispose();
    expect(history.retentionStatistics).toEqual({
      undoEntries: 0,
      redoEntries: 0,
      estimatedUndoBytes: 0,
      estimatedRedoBytes: 0,
      estimatedBytes: 0,
      totalPrunedEntries: 0,
      totalDiscardedRedoEntries: 0,
      costEstimationFailureCount: 0
    });
  });

  it("bounds a deterministic 10,000-operation session", () => {
    const history = new HistoryEngine({ maxEntries: 100 });
    let current = document();
    for (let index = 1; index <= 10_000; index++)
      current = history.execute(rename(String(index)), current);
    expect(current.metadata.name).toBe("10000");
    expect(history.retentionStatistics).toMatchObject({
      undoEntries: 100,
      redoEntries: 0,
      totalPrunedEntries: 9_900
    });
    for (let index = 0; index < 100; index++) current = history.undo(current);
    expect(current.metadata.name).toBe("9900");
    expect(history.executeUndo(current).status).toBe("not-available");
  });

  it("makes equivalent pruning decisions across engine instances", () => {
    const run = (): readonly number[] => {
      const history = new HistoryEngine({ maxEntries: 3, costEstimator: fortyBytes });
      let current = document();
      for (const name of ["A", "B", "C", "D", "E"])
        current = history.execute(rename(name), current);
      return [history.state.undoDepth, history.retentionStatistics.totalPrunedEntries];
    };
    expect(run()).toEqual(run());
  });
});
