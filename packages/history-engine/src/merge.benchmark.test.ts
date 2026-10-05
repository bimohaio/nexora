import {
  DeterministicIdGenerator,
  FixedClock,
  createScadaDocument,
  type Command,
  type ScadaDocument
} from "@web-scada/core";
import { describe, expect, it } from "vitest";
import { HistoryEngine } from "./engine.js";
import type { HistoryMergeableCommand } from "./contracts.js";

function command(index: number): HistoryMergeableCommand {
  let before: ScadaDocument | undefined;
  let after: ScadaDocument | undefined;
  return {
    id: `command-${String(index)}`,
    type: "update-property",
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
    historyMerge: {
      key: "property:document:name",
      commandKind: "update-property",
      targetIds: ["document"],
      policy: "compatible-neighbor"
    },
    execute: ({ document }) => {
      before = document;
      after = { ...document, metadata: { ...document.metadata, name: String(index) } };
      return { document: after };
    },
    undo: ({ document }) => ({ document: before ?? document }),
    redo: ({ document }) => ({ document: after ?? document }),
    canMergeWith: (next: Command) =>
      "historyMerge" in next &&
      (next as HistoryMergeableCommand).historyMerge.key === "property:document:name"
  };
}

describe("history merge performance diagnostic", () => {
  it("records 10,000 compatible candidates with constant-depth history", () => {
    const history = new HistoryEngine({ maxEntries: 100 });
    let current = createScadaDocument({
      name: "History benchmark",
      idGenerator: new DeterministicIdGenerator(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z")
    });
    const started = performance.now();
    for (let index = 0; index < 10_000; index++) current = history.execute(command(index), current);
    const elapsedMs = performance.now() - started;
    console.log(
      JSON.stringify({
        environment: `node ${process.version}`,
        candidates: 10_000,
        repetitions: 1,
        elapsedMs,
        undoDepth: history.state.undoDepth,
        merges: history.compressionStatistics.mergeCount
      })
    );
    expect(history.state.undoDepth).toBe(1);
    expect(history.compressionStatistics.mergeCount).toBe(9_999);
  });
});
