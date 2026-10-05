import {
  DeterministicIdGenerator,
  FixedClock,
  createEmptyChangeSet,
  createScadaDocument,
  type Command,
  type CommandContext,
  type CommandResult,
  type ScadaDocument
} from "@web-scada/core";
import { describe, expect, it, vi } from "vitest";
import { HistoryEngine } from "./engine.js";
import { HistoryError } from "./error.js";
import type { HistoryEvent } from "./contracts.js";

function document(name = "Initial"): ScadaDocument {
  return createScadaDocument({
    name,
    idGenerator: new DeterministicIdGenerator(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z")
  });
}

function renameCommand(name: string): Command {
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

describe("HistoryEngine", () => {
  it("constructs with an immutable default state", () => {
    const history = new HistoryEngine();
    expect(history.state).toEqual({
      revision: 0,
      undoDepth: 0,
      redoDepth: 0,
      transactionDepth: 0,
      canUndo: false,
      canRedo: false,
      isDisposed: false
    });
    expect(Object.isFrozen(history.state)).toBe(true);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY])("rejects invalid maxEntries %s", (value) => {
    expect(() => new HistoryEngine({ maxEntries: value })).toThrowError(HistoryError);
  });

  it("records in deterministic sequence, enforces limits, and does not mutate options", () => {
    const options = Object.freeze({ maxEntries: 2 });
    const history = new HistoryEngine(options);
    const initial = document();
    const first = history.execute(renameCommand("A"), initial);
    const second = history.execute(renameCommand("B"), first);
    history.execute(renameCommand("C"), second);
    expect(history.state).toMatchObject({ revision: 3, undoDepth: 2, canUndo: true });
    expect(options).toEqual({ maxEntries: 2 });
  });

  it("invalidates redo on divergent recording and clears deterministically", () => {
    const history = new HistoryEngine();
    const initial = document();
    const first = history.execute(renameCommand("A"), initial);
    const second = history.execute(renameCommand("B"), first);
    const undone = history.undo(second);
    expect(history.state.canRedo).toBe(true);
    history.execute(renameCommand("C"), undone);
    expect(history.state.canRedo).toBe(false);
    history.clear();
    expect(history.state).toMatchObject({ undoDepth: 0, redoDepth: 0, revision: 5 });
  });

  it("groups transaction operations into one logical entry and rejects nesting", () => {
    const history = new HistoryEngine();
    const initial = document();
    const transaction = history.beginTransaction({ label: "Rename twice" });
    const first = history.execute(renameCommand("A"), initial);
    history.execute(renameCommand("B"), first);
    expect(history.state).toMatchObject({ transactionDepth: 1, undoDepth: 0 });
    expect(() => history.beginTransaction()).toThrowError(HistoryError);
    const result = transaction.commit();
    expect(result.entry).toMatchObject({
      id: "history-1",
      sequence: 1,
      transactionId: "transaction-1",
      label: "Rename twice"
    });
    expect(result.entry?.operations).toHaveLength(2);
    expect(history.state).toMatchObject({ transactionDepth: 0, undoDepth: 1 });
    expect(() => transaction.commit()).toThrowError(HistoryError);
  });

  it("cancels without a committed entry and rejects clear during a transaction", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    history.execute(renameCommand("A"), document());
    expect(() => {
      history.clear();
    }).toThrowError(HistoryError);
    transaction.cancel();
    expect(history.state).toMatchObject({ transactionDepth: 0, undoDepth: 0 });
  });

  it("disposes listeners and active transactions idempotently", () => {
    const history = new HistoryEngine();
    const listener = vi.fn();
    const subscription = history.subscribe(listener);
    const transaction = history.beginTransaction();
    history.dispose();
    history.dispose();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: "disposed" }));
    expect(history.state).toMatchObject({ isDisposed: true, transactionDepth: 0 });
    expect(() => history.execute(renameCommand("A"), document())).toThrowError(HistoryError);
    expect(() => history.subscribe(listener)).toThrowError(HistoryError);
    expect(() => {
      transaction.cancel();
    }).toThrowError(HistoryError);
    subscription.unsubscribe();
    expect(subscription.closed).toBe(true);
  });

  it("does not retain no-op commands and treats zero as disabled retention", () => {
    const history = new HistoryEngine({ maxEntries: 0 });
    history.execute(renameCommand("A"), document());
    expect(history.state).toMatchObject({ undoDepth: 0, canUndo: false, revision: 1 });
  });

  it("copies and freezes merge and restoration metadata", () => {
    const history = new HistoryEngine();
    const initial = document();
    const command = renameCommand("A");
    const after = command.execute({ document: initial }).document;
    const targetIds = ["node-a"];
    const selected = ["node-a"];
    const entry = history.record({
      command,
      before: initial,
      after,
      merge: { key: "rename", targetIds },
      restoration: { after: { selected } }
    });
    targetIds.push("node-b");
    selected.push("node-b");
    expect(entry?.operations[0]?.merge?.targetIds).toEqual(["node-a"]);
    expect(entry?.operations[0]?.restoration?.after).toEqual({ selected: ["node-a"] });
    expect(Object.isFrozen(entry?.operations[0]?.restoration?.after)).toBe(true);
  });

  it("returns typed no-op results without changing revision", () => {
    const history = new HistoryEngine();
    const initial = document();
    expect(history.executeUndo(initial)).toMatchObject({
      status: "not-available",
      document: initial,
      diagnostics: [],
      state: { revision: 0 }
    });
    expect(history.executeRedo(initial)).toMatchObject({
      status: "not-available",
      state: { revision: 0 }
    });
  });

  it("preserves deterministic multi-step undo and redo ordering", () => {
    const history = new HistoryEngine();
    const initial = document();
    const a = history.execute(renameCommand("A"), initial);
    const b = history.execute(renameCommand("B"), a);
    const c = history.execute(renameCommand("C"), b);

    const undoC = history.executeUndo(c);
    const undoB = history.executeUndo(undoC.document);
    expect(undoC.document.metadata.name).toBe("B");
    expect(undoB.document.metadata.name).toBe("A");
    expect(history.state).toMatchObject({ undoDepth: 1, redoDepth: 2, revision: 5 });

    const redoB = history.executeRedo(undoB.document);
    const redoC = history.executeRedo(redoB.document);
    expect(redoB.document.metadata.name).toBe("B");
    expect(redoC.document.metadata.name).toBe("C");
    expect(history.state).toMatchObject({ undoDepth: 3, redoDepth: 0, revision: 7 });
  });

  it("keeps stacks and revision atomic when undo or redo execution fails", () => {
    const history = new HistoryEngine();
    const initial = document();
    const command = renameCommand("A");
    const after = history.execute(command, initial);
    command.undo = () => {
      throw new Error("undo failed");
    };
    const failedUndo = history.executeUndo(after);
    expect(failedUndo).toMatchObject({
      status: "failed",
      document: after,
      diagnostics: [{ code: "HISTORY_UNDO_FAILED" }],
      state: { revision: 1, undoDepth: 1, redoDepth: 0 }
    });

    command.undo = () => ({ document: initial });
    expect(history.executeUndo(after).status).toBe("applied");
    command.redo = () => {
      throw new Error("redo failed");
    };
    const failedRedo = history.executeRedo(initial);
    expect(failedRedo).toMatchObject({
      status: "failed",
      document: initial,
      diagnostics: [{ code: "HISTORY_REDO_FAILED" }],
      state: { revision: 2, undoDepth: 0, redoDepth: 1 }
    });
  });

  it("rejects a different logical document without touching history", () => {
    const history = new HistoryEngine();
    const initial = document();
    history.execute(renameCommand("A"), initial);
    const mismatch = history.executeUndo(document("Other"));
    expect(mismatch).toMatchObject({
      status: "failed",
      diagnostics: [{ code: "HISTORY_DOCUMENT_MISMATCH" }],
      state: { revision: 1, undoDepth: 1, redoDepth: 0 }
    });
  });

  it("propagates change sets and emits atomic undo/redo events", () => {
    const changes = { ...createEmptyChangeSet(), metadataChanged: true };
    const history = new HistoryEngine({ deriveChanges: () => changes });
    const events: HistoryEvent[] = [];
    const subscription = history.subscribe((event) => events.push(event));
    const initial = document();
    const after = history.execute(renameCommand("A"), initial);
    const undone = history.executeUndo(after);
    expect(undone).toMatchObject({ status: "applied", changes });
    expect(events.at(-1)?.type).toBe("undone");
    expect(events.at(-1)?.state).toMatchObject({ undoDepth: 0, redoDepth: 1 });
    subscription.unsubscribe();
    history.executeRedo(undone.document);
    expect(events).toHaveLength(2);
  });

  it("enforces the history limit across complete undo and redo round trips", () => {
    const history = new HistoryEngine({ maxEntries: 3 });
    const initial = document();
    const a = history.execute(renameCommand("A"), initial);
    const b = history.execute(renameCommand("B"), a);
    const c = history.execute(renameCommand("C"), b);
    let current = history.execute(renameCommand("D"), c);
    for (const expected of ["C", "B", "A"]) {
      current = history.executeUndo(current).document;
      expect(current.metadata.name).toBe(expected);
    }
    expect(history.executeUndo(current).status).toBe("not-available");
    for (const expected of ["B", "C", "D"]) {
      current = history.executeRedo(current).document;
      expect(current.metadata.name).toBe(expected);
    }
    expect(history.executeRedo(current).status).toBe("not-available");
  });

  it("exposes deterministic transaction lifecycle states and typed cancellation", () => {
    const history = new HistoryEngine();
    const events: HistoryEvent[] = [];
    history.subscribe((event) => events.push(event));
    const transaction = history.beginTransaction();
    expect(transaction.state).toBe("active");
    expect(history.state).toMatchObject({ transactionDepth: 1, revision: 1 });
    expect(transaction.cancel()).toEqual({ committed: false, state: "cancelled" });
    expect(transaction.state).toBe("cancelled");
    expect(history.state).toMatchObject({ transactionDepth: 0, revision: 2 });
    expect(events.map(({ type }) => type)).toEqual([
      "transaction-started",
      "transaction-cancelled"
    ]);
    expect(() => transaction.commit()).toThrowError(HistoryError);
    expect(() => transaction.cancel()).toThrowError(HistoryError);
  });

  it("commits an empty transaction without consuming history or invalidating redo", () => {
    const history = new HistoryEngine();
    const initial = document();
    const after = history.execute(renameCommand("A"), initial);
    history.undo(after);
    const transaction = history.beginTransaction({ label: "Empty" });
    expect(transaction.commit()).toEqual({ committed: false, state: "committed" });
    expect(transaction.state).toBe("committed");
    expect(history.state).toMatchObject({ undoDepth: 0, redoDepth: 1, revision: 4 });
  });

  it("commits one immutable multi-operation entry and emits one commit event", () => {
    const changes = { ...createEmptyChangeSet(), metadataChanged: true };
    const history = new HistoryEngine({ deriveChanges: () => changes });
    const events: HistoryEvent[] = [];
    history.subscribe((event) => events.push(event));
    const metadata = { targets: ["node-a", "node-b"] };
    const transaction = history.beginTransaction({
      label: "Rename twice",
      mergeKey: "rename",
      metadata
    });
    const initial = document();
    const a = history.execute(renameCommand("A"), initial);
    const b = history.execute(renameCommand("B"), a);
    const result = transaction.commit();
    metadata.targets.push("node-c");

    expect(result).toMatchObject({ committed: true, state: "committed" });
    expect(result.entry).toMatchObject({
      id: "history-1",
      sequence: 1,
      transactionId: "transaction-1",
      label: "Rename twice",
      mergeKey: "rename",
      transactionMetadata: { targets: ["node-a", "node-b"] }
    });
    expect(Object.isFrozen(result.entry?.transactionMetadata)).toBe(true);
    expect(result.entry?.operations).toHaveLength(2);
    expect(history.state).toMatchObject({ undoDepth: 1, revision: 2 });
    expect(events.map(({ type }) => type)).toEqual([
      "transaction-started",
      "transaction-committed"
    ]);

    const undone = history.executeUndo(b);
    expect(undone.document).toBe(initial);
    expect(undone.changes).toEqual(changes);
    const redone = history.executeRedo(undone.document);
    expect(redone.document).toBe(b);
    expect(redone.changes).toEqual(changes);
  });

  it("invalidates redo only when a divergent transaction commits", () => {
    const history = new HistoryEngine();
    const initial = document();
    const a = history.execute(renameCommand("A"), initial);
    const undone = history.undo(a);

    const cancelled = history.beginTransaction();
    cancelled.cancel();
    expect(history.canRedo).toBe(true);

    const divergent = history.beginTransaction();
    history.execute(renameCommand("B"), undone);
    divergent.commit();
    expect(history.state).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  });

  it("rejects nested transactions while preserving the outer transaction", () => {
    const history = new HistoryEngine();
    const outer = history.beginTransaction();
    expect(() => history.beginTransaction()).toThrowError(HistoryError);
    expect(outer.state).toBe("active");
    expect(history.state).toMatchObject({ transactionDepth: 1, revision: 1 });
    outer.cancel();
  });

  it("marks an invalid discontinuous commit failed without changing stacks", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    const initial = document();
    const firstCommand = renameCommand("A");
    const first = firstCommand.execute({ document: initial }).document;
    history.record({ command: firstCommand, before: initial, after: first });
    const unrelated = document("Unrelated");
    const secondCommand = renameCommand("B");
    const second = secondCommand.execute({ document: unrelated }).document;
    history.record({ command: secondCommand, before: unrelated, after: second });

    let commitError: unknown;
    try {
      transaction.commit();
    } catch (error) {
      commitError = error;
    }
    expect(commitError).toBeInstanceOf(HistoryError);
    expect((commitError as HistoryError).code).toBe("HISTORY_TRANSACTION_COMMIT_FAILED");
    expect(transaction.state).toBe("failed");
    expect(history.state).toMatchObject({
      transactionDepth: 0,
      undoDepth: 0,
      redoDepth: 0,
      revision: 2
    });
    expect(() => transaction.commit()).toThrowError(HistoryError);
  });

  it("rejects a transaction containing a non-reversible untyped operation", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    const initial = document();
    const valid = renameCommand("A");
    const after = valid.execute({ document: initial }).document;
    const malformed = { ...valid, undo: undefined } as unknown as Command;
    history.record({ command: malformed, before: initial, after });
    expect(() => transaction.commit()).toThrowError(HistoryError);
    expect(transaction.state).toBe("failed");
    expect(history.state.undoDepth).toBe(0);
  });

  it("does not record a command that throws inside an active transaction", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    const failing = renameCommand("Failure");
    failing.execute = () => {
      throw new Error("execute failed");
    };
    expect(() => history.execute(failing, document())).toThrow("execute failed");
    expect(transaction.commit()).toEqual({ committed: false, state: "committed" });
    expect(history.state.undoDepth).toBe(0);
  });

  it("keeps transaction history bookkeeping atomic on partial undo and redo failures", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    const initial = document();
    const commandA = renameCommand("A");
    const commandB = renameCommand("B");
    const commandC = renameCommand("C");
    const a = history.execute(commandA, initial);
    const b = history.execute(commandB, a);
    const c = history.execute(commandC, b);
    transaction.commit();

    const undoB = commandB.undo.bind(commandB);
    commandB.undo = () => {
      throw new Error("middle undo failed");
    };
    const failedUndo = history.executeUndo(c);
    expect(failedUndo).toMatchObject({
      status: "failed",
      document: c,
      state: { undoDepth: 1, redoDepth: 0, revision: 2 }
    });

    commandB.undo = undoB;
    const undone = history.executeUndo(c);
    expect(undone.document).toBe(initial);
    const redoB = commandB.redo.bind(commandB);
    commandB.redo = () => {
      throw new Error("middle redo failed");
    };
    const failedRedo = history.executeRedo(initial);
    expect(failedRedo).toMatchObject({
      status: "failed",
      document: initial,
      state: { undoDepth: 0, redoDepth: 1, revision: 3 }
    });
    commandB.redo = redoB;
    expect(history.executeRedo(initial).document).toBe(c);
  });

  it("evicts transactions atomically as one logical history unit", () => {
    const history = new HistoryEngine({ maxEntries: 2 });
    let current = document();
    const transactionNames: readonly (readonly [string, string])[] = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"]
    ];
    for (const names of transactionNames) {
      const transaction = history.beginTransaction({ label: names[0] });
      for (const name of names) current = history.execute(renameCommand(name), current);
      transaction.commit();
    }
    expect(history.state.undoDepth).toBe(2);
    current = history.undo(current);
    expect(current.metadata.name).toBe("B2");
    current = history.undo(current);
    expect(current.metadata.name).toBe("A2");
    expect(history.executeUndo(current).status).toBe("not-available");
  });

  it("invalidates an active handle on dispose without retaining a transaction", () => {
    const history = new HistoryEngine();
    const transaction = history.beginTransaction();
    history.execute(renameCommand("A"), document());
    history.dispose();
    expect(transaction.state).toBe("cancelled");
    expect(history.state).toMatchObject({ transactionDepth: 0, isDisposed: true });
    expect(() => transaction.commit()).toThrowError(HistoryError);
    expect(() => history.beginTransaction()).toThrowError(HistoryError);
  });
});
