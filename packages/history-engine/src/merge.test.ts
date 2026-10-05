import {
  DeterministicIdGenerator,
  FixedClock,
  createScadaDocument,
  type CommandContext,
  type CommandResult,
  type ScadaDocument
} from "@web-scada/core";
import { describe, expect, it } from "vitest";
import { HistoryEngine } from "./engine.js";
import { HistoryError } from "./error.js";
import type { HistoryMergeableCommand } from "./contracts.js";

function document(name = "Initial"): ScadaDocument {
  return createScadaDocument({
    name,
    idGenerator: new DeterministicIdGenerator(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z")
  });
}

function mergeableRename(
  name: string,
  options: {
    readonly target?: string;
    readonly property?: string;
    readonly timestamp?: string;
    readonly groupId?: string;
    readonly failCompatibility?: boolean;
  } = {}
): HistoryMergeableCommand {
  let before: ScadaDocument | undefined;
  let after: ScadaDocument | undefined;
  const target = options.target ?? "document";
  const property = options.property ?? "name";
  return {
    id: `rename-${name}`,
    type: "update-property",
    timestamp: options.timestamp ?? "2026-01-01T00:00:00.000Z",
    metadata: {},
    historyMerge: {
      key: `property:${target}:${property}`,
      commandKind: "update-property",
      targetIds: [target],
      ...(options.groupId === undefined ? {} : { groupId: options.groupId }),
      policy: "compatible-neighbor"
    },
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
    canMergeWith(command): boolean {
      if (options.failCompatibility === true) throw new Error("fault injection");
      return (
        "historyMerge" in command &&
        (command as HistoryMergeableCommand).historyMerge.key === `property:${target}:${property}`
      );
    },
    isHistoryNoOp(initial, final): boolean {
      return initial.metadata.name === final.metadata.name;
    }
  };
}

describe("HistoryEngine command merging and compression", () => {
  it("merges compatible adjacent operations with correct undo and redo", () => {
    const history = new HistoryEngine();
    const initial = document();
    const first = history.execute(mergeableRename("P"), initial);
    const second = history.execute(mergeableRename("Pu"), first);
    const final = history.execute(mergeableRename("Pump"), second);

    expect(history.state.undoDepth).toBe(1);
    expect(history.compressionStatistics).toEqual({
      mergeCount: 2,
      noOpRemovalCount: 0,
      mergeFailureCount: 0
    });
    const undone = history.executeUndo(final);
    expect(undone.document).toBe(initial);
    const redone = history.executeRedo(undone.document);
    expect(redone.document).toBe(final);
  });

  it("keeps different targets, properties, groups, and command capabilities separate", () => {
    const history = new HistoryEngine();
    let current = document();
    current = history.execute(mergeableRename("A", { target: "a" }), current);
    current = history.execute(mergeableRename("B", { target: "b" }), current);
    current = history.execute(mergeableRename("C", { target: "b", property: "label" }), current);
    current = history.execute(
      mergeableRename("D", { target: "b", property: "label", groupId: "g" }),
      current
    );
    expect(current.metadata.name).toBe("D");
    expect(history.state.undoDepth).toBe(4);
  });

  it("uses the injected timestamp data only as an additional condition", () => {
    const history = new HistoryEngine({ compression: { maxIntervalMs: 100 } });
    const initial = document();
    const first = history.execute(
      mergeableRename("A", { timestamp: "2026-01-01T00:00:00.000Z" }),
      initial
    );
    history.execute(mergeableRename("B", { timestamp: "2026-01-01T00:00:00.101Z" }), first);
    expect(history.state.undoDepth).toBe(2);
    expect(() => new HistoryEngine({ compression: { maxIntervalMs: -1 } })).toThrowError(
      HistoryError
    );
  });

  it("eliminates a proven merged no-op and supports disabling that optimization", () => {
    const initial = document();
    const compressed = new HistoryEngine();
    const changed = compressed.execute(mergeableRename("Changed"), initial);
    compressed.execute(mergeableRename("Initial"), changed);
    expect(compressed.state.undoDepth).toBe(0);
    expect(compressed.compressionStatistics.noOpRemovalCount).toBe(1);

    const retained = new HistoryEngine({ compression: { removeNoOps: false } });
    const retainedChanged = retained.execute(mergeableRename("Changed"), initial);
    retained.execute(mergeableRename("Initial"), retainedChanged);
    expect(retained.state.undoDepth).toBe(1);
  });

  it("can disable automatic adjacent merging without changing command results", () => {
    const history = new HistoryEngine({ compression: { enabled: false } });
    const initial = document();
    const first = history.execute(mergeableRename("A"), initial);
    const final = history.execute(mergeableRename("B"), first);
    expect(final.metadata.name).toBe("B");
    expect(history.state.undoDepth).toBe(2);
    expect(history.undo(final)).toBe(first);
  });

  it("compresses transaction tails but never crosses the committed boundary", () => {
    const history = new HistoryEngine();
    const initial = document();
    const transaction = history.beginTransaction({ label: "Edit name" });
    const first = history.execute(mergeableRename("A"), initial);
    const final = history.execute(mergeableRename("B"), first);
    const committed = transaction.commit();
    expect(committed.entry?.operations).toHaveLength(1);
    expect(history.state.undoDepth).toBe(1);

    const afterBoundary = history.execute(mergeableRename("C"), final);
    expect(history.state.undoDepth).toBe(2);
    expect(history.undo(afterBoundary)).toBe(final);
  });

  it("discards compressed transaction state on cancellation", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    const initial = document();
    const first = history.execute(mergeableRename("A"), initial);
    history.execute(mergeableRename("B"), first);
    transaction.cancel();
    expect(history.state.undoDepth).toBe(0);
  });

  it("enforces explicit, undo, redo, and clear barriers", () => {
    const history = new HistoryEngine();
    const initial = document();
    const first = history.execute(mergeableRename("A"), initial);
    history.createMergeBarrier();
    const second = history.execute(mergeableRename("B"), first);
    expect(history.state.undoDepth).toBe(2);
    const undone = history.undo(second);
    const redone = history.redo(undone);
    history.execute(mergeableRename("C"), redone);
    expect(history.state.undoDepth).toBe(3);
    history.clear();
    expect(history.state.undoDepth).toBe(0);
  });

  it("falls back to separate valid entries and exposes a typed merge diagnostic", () => {
    const history = new HistoryEngine();
    const initial = document();
    const first = history.execute(mergeableRename("A", { failCompatibility: true }), initial);
    const second = history.execute(mergeableRename("B"), first);
    expect(history.state.undoDepth).toBe(2);
    expect(history.compressionStatistics.mergeFailureCount).toBe(1);
    expect(history.executeUndo(second).entry?.diagnostics).toEqual([
      expect.objectContaining({ code: "HISTORY_MERGE_FAILED", severity: "warning" })
    ]);
  });

  it("applies compression before entry-limit enforcement", () => {
    const history = new HistoryEngine({ maxEntries: 1 });
    const initial = document();
    const first = history.execute(mergeableRename("A"), initial);
    const final = history.execute(mergeableRename("B"), first);
    expect(history.state.undoDepth).toBe(1);
    expect(history.undo(final)).toBe(initial);
  });

  it("re-estimates merged entries and releases compressed no-op accounting", () => {
    const history = new HistoryEngine({
      costEstimator: {
        estimate: (entry) => String(entry.operations.at(-1)?.after.metadata.name).length * 10
      }
    });
    const initial = document();
    const first = history.execute(mergeableRename("A"), initial);
    const merged = history.execute(mergeableRename("Four"), first);
    expect(history.retentionStatistics).toMatchObject({ undoEntries: 1, estimatedBytes: 40 });
    history.execute(mergeableRename("Initial"), merged);
    expect(history.retentionStatistics).toMatchObject({ undoEntries: 0, estimatedBytes: 0 });
  });
});
