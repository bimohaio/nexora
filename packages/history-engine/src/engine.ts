import {
  mergeChangeSets,
  type Command,
  type DocumentChangeSet,
  type ScadaDocument
} from "@web-scada/core";
import type {
  HistoryEntry,
  HistoryCompressionPolicy,
  HistoryCompressionStatistics,
  HistoryCostEstimator,
  HistoryDiagnostic,
  HistoryExecutionResult,
  HistoryEvent,
  HistoryEventType,
  HistoryListener,
  HistoryOperation,
  HistoryOptions,
  HistoryMergeableCommand,
  HistoryRestorationValue,
  HistoryRetentionStatistics,
  HistoryState,
  HistorySubscription,
  HistoryTransactionHandle,
  HistoryTransactionOptions,
  HistoryTransactionResult,
  HistoryTransactionState
} from "./contracts.js";
import { HistoryError } from "./error.js";

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_COMPRESSION_POLICY: Required<HistoryCompressionPolicy> = Object.freeze({
  enabled: true,
  mergeAdjacentCommands: true,
  removeNoOps: true,
  maxIntervalMs: Number.POSITIVE_INFINITY
});

interface ActiveTransaction {
  readonly id: string;
  readonly options: HistoryTransactionOptions;
  readonly operations: HistoryOperation[];
  readonly state: { value: HistoryTransactionState };
}

function freezeOperation(operation: HistoryOperation): HistoryOperation {
  return Object.freeze({
    ...operation,
    ...(operation.changes === undefined ? {} : { changes: freezeChangeSet(operation.changes) }),
    ...(operation.undoChanges === undefined
      ? {}
      : { undoChanges: freezeChangeSet(operation.undoChanges) }),
    ...(operation.merge === undefined
      ? {}
      : {
          merge: Object.freeze({
            ...operation.merge,
            ...(operation.merge.targetIds === undefined
              ? {}
              : { targetIds: Object.freeze([...operation.merge.targetIds]) })
          })
        }),
    ...(operation.restoration === undefined
      ? {}
      : {
          restoration: Object.freeze({
            ...(operation.restoration.before === undefined
              ? {}
              : { before: cloneRestoration(operation.restoration.before) }),
            ...(operation.restoration.after === undefined
              ? {}
              : { after: cloneRestoration(operation.restoration.after) })
          })
        })
  });
}

function commandMergeMetadata(command: Command): HistoryOperation["merge"] {
  if (!("historyMerge" in command)) return undefined;
  const candidate = (command as Partial<HistoryMergeableCommand>).historyMerge;
  if (candidate === undefined || typeof candidate.key !== "string" || candidate.key.trim() === "")
    return undefined;
  return candidate;
}

function parseTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sameTargets(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

class CompressedHistoryCommand implements Command {
  public readonly id: string;
  public readonly type: Command["type"];
  public readonly timestamp: string;
  public readonly metadata: Readonly<Record<string, unknown>>;
  public readonly historyMerge: HistoryOperation["merge"];

  public constructor(
    previous: Readonly<HistoryOperation>,
    next: Readonly<HistoryOperation>,
    private readonly latestCommand: Command
  ) {
    this.id = previous.command.id;
    this.type = previous.command.type;
    this.timestamp = next.command.timestamp;
    this.metadata = previous.command.metadata;
    this.historyMerge = previous.merge;
    this.#before = previous.before;
    this.#after = next.after;
  }

  readonly #before: ScadaDocument;
  readonly #after: ScadaDocument;

  public execute(): { readonly document: ScadaDocument } {
    return { document: this.#after };
  }

  public undo(): { readonly document: ScadaDocument } {
    return { document: this.#before };
  }

  public redo(): { readonly document: ScadaDocument } {
    return { document: this.#after };
  }

  public canMergeWith(command: Command): boolean {
    return this.latestCommand.canMergeWith(command);
  }

  public isHistoryNoOp(before: Readonly<ScadaDocument>, after: Readonly<ScadaDocument>): boolean {
    if (!("isHistoryNoOp" in this.latestCommand)) return false;
    const detector = (this.latestCommand as Partial<HistoryMergeableCommand>).isHistoryNoOp;
    return detector?.call(this.latestCommand, before, after) === true;
  }
}

function freezeChangeSet(changes: DocumentChangeSet): DocumentChangeSet {
  return Object.freeze({
    ...changes,
    addedNodeIds: Object.freeze([...changes.addedNodeIds]),
    updatedNodeIds: Object.freeze([...changes.updatedNodeIds]),
    removedNodeIds: Object.freeze([...changes.removedNodeIds]),
    addedConnectionIds: Object.freeze([...changes.addedConnectionIds]),
    updatedConnectionIds: Object.freeze([...changes.updatedConnectionIds]),
    removedConnectionIds: Object.freeze([...changes.removedConnectionIds]),
    addedLayerIds: Object.freeze([...changes.addedLayerIds]),
    updatedLayerIds: Object.freeze([...changes.updatedLayerIds]),
    removedLayerIds: Object.freeze([...changes.removedLayerIds]),
    addedVariableIds: Object.freeze([...changes.addedVariableIds]),
    updatedVariableIds: Object.freeze([...changes.updatedVariableIds]),
    removedVariableIds: Object.freeze([...changes.removedVariableIds]),
    addedBindingIds: Object.freeze([...changes.addedBindingIds]),
    updatedBindingIds: Object.freeze([...changes.updatedBindingIds]),
    removedBindingIds: Object.freeze([...changes.removedBindingIds])
  });
}

function cloneRestoration(value: HistoryRestorationValue): HistoryRestorationValue {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneRestoration));
  if (typeof value === "object" && value !== null) {
    const clone: Record<string, HistoryRestorationValue> = {};
    for (const [key, child] of Object.entries(value)) clone[key] = cloneRestoration(child);
    return Object.freeze(clone);
  }
  return value;
}

function freezeTransactionOptions(options: HistoryTransactionOptions): HistoryTransactionOptions {
  return Object.freeze({
    ...options,
    ...(options.metadata === undefined
      ? {}
      : {
          metadata: Object.freeze(
            Object.fromEntries(
              Object.entries(options.metadata).map(([key, value]) => [key, cloneRestoration(value)])
            )
          )
        })
  });
}

export class HistoryEngine {
  readonly #maxEntries: number;
  readonly #maxEstimatedBytes: number | undefined;
  readonly #costEstimator: HistoryCostEstimator | undefined;
  readonly #deriveChanges: HistoryOptions["deriveChanges"];
  readonly #compression: Required<HistoryCompressionPolicy>;
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  readonly #listeners = new Set<HistoryListener>();
  #activeTransaction: ActiveTransaction | undefined;
  #sequence = 0;
  #transactionSequence = 0;
  #revision = 0;
  #disposed = false;
  #executing = false;
  #mergeAllowed = false;
  #mergeCount = 0;
  #noOpRemovalCount = 0;
  #mergeFailureCount = 0;
  readonly #pendingDiagnostics: HistoryDiagnostic[] = [];
  readonly #entryCosts = new Map<HistoryEntry, number>();
  #estimatedUndoBytes = 0;
  #estimatedRedoBytes = 0;
  #totalPrunedEntries = 0;
  #totalDiscardedRedoEntries = 0;
  #costEstimationFailureCount = 0;

  public constructor(options: HistoryOptions = {}) {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
      throw new HistoryError(
        "HISTORY_INVALID_LIMIT",
        "maxEntries must be a non-negative safe integer"
      );
    }
    this.#maxEntries = maxEntries;
    const maxEstimatedBytes = options.maxEstimatedBytes;
    if (
      maxEstimatedBytes !== undefined &&
      (!Number.isFinite(maxEstimatedBytes) || maxEstimatedBytes < 0)
    )
      throw new HistoryError(
        "HISTORY_INVALID_LIMIT",
        "maxEstimatedBytes must be a non-negative finite number"
      );
    if (maxEstimatedBytes !== undefined && options.costEstimator === undefined)
      throw new HistoryError(
        "HISTORY_INVALID_LIMIT",
        "maxEstimatedBytes requires a deterministic costEstimator"
      );
    this.#maxEstimatedBytes = maxEstimatedBytes;
    this.#costEstimator = options.costEstimator;
    this.#deriveChanges = options.deriveChanges;
    const compression = options.compression ?? {};
    const maxIntervalMs = compression.maxIntervalMs ?? Number.POSITIVE_INFINITY;
    if (
      (maxIntervalMs !== Number.POSITIVE_INFINITY && !Number.isFinite(maxIntervalMs)) ||
      maxIntervalMs < 0
    )
      throw new HistoryError(
        "HISTORY_INVALID_MERGE_POLICY",
        "compression.maxIntervalMs must be a non-negative finite number when supplied"
      );
    this.#compression = Object.freeze({
      enabled: compression.enabled ?? DEFAULT_COMPRESSION_POLICY.enabled,
      mergeAdjacentCommands:
        compression.mergeAdjacentCommands ?? DEFAULT_COMPRESSION_POLICY.mergeAdjacentCommands,
      removeNoOps: compression.removeNoOps ?? DEFAULT_COMPRESSION_POLICY.removeNoOps,
      maxIntervalMs
    });
  }

  public get state(): HistoryState {
    return Object.freeze({
      revision: this.#revision,
      undoDepth: this.#undo.length,
      redoDepth: this.#redo.length,
      transactionDepth: this.#activeTransaction === undefined ? 0 : 1,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      isDisposed: this.#disposed
    });
  }

  public get canUndo(): boolean {
    return !this.#disposed && this.#undo.length > 0;
  }

  public get canRedo(): boolean {
    return !this.#disposed && this.#redo.length > 0;
  }

  public get compressionStatistics(): HistoryCompressionStatistics {
    return Object.freeze({
      mergeCount: this.#mergeCount,
      noOpRemovalCount: this.#noOpRemovalCount,
      mergeFailureCount: this.#mergeFailureCount
    });
  }

  public get retentionStatistics(): HistoryRetentionStatistics {
    return Object.freeze({
      undoEntries: this.#undo.length,
      redoEntries: this.#redo.length,
      estimatedUndoBytes: this.#estimatedUndoBytes,
      estimatedRedoBytes: this.#estimatedRedoBytes,
      estimatedBytes: this.#estimatedUndoBytes + this.#estimatedRedoBytes,
      totalPrunedEntries: this.#totalPrunedEntries,
      totalDiscardedRedoEntries: this.#totalDiscardedRedoEntries,
      costEstimationFailureCount: this.#costEstimationFailureCount
    });
  }

  public execute(command: Command, document: ScadaDocument): ScadaDocument {
    this.#assertActive();
    const after = command.execute({ document }).document;
    if (after !== document) {
      const changes = this.#deriveChanges?.(document, after);
      const undoChanges = this.#deriveChanges?.(after, document);
      const merge = commandMergeMetadata(command);
      this.record({
        command,
        before: document,
        after,
        ...(merge === undefined ? {} : { merge }),
        ...(changes === undefined ? {} : { changes }),
        ...(undoChanges === undefined ? {} : { undoChanges })
      });
    }
    return after;
  }

  public record(operation: HistoryOperation): HistoryEntry | undefined {
    this.#assertActive();
    const immutable = freezeOperation(operation);
    if (this.#activeTransaction !== undefined) {
      this.#appendOperation(this.#activeTransaction.operations, immutable, true);
      return undefined;
    }
    if (this.#tryMergeCommitted(immutable)) return this.#undo.at(-1);
    return this.#commitEntry([immutable]);
  }

  /** Prevents the next candidate from merging with the current history tail. */
  public createMergeBarrier(): void {
    this.#assertActive();
    if (this.#activeTransaction !== undefined)
      throw new HistoryError(
        "HISTORY_TRANSACTION_ACTIVE",
        "Cannot create a committed merge barrier during a transaction"
      );
    this.#mergeAllowed = false;
    this.#transition("merge-barrier");
  }

  public undo(document: ScadaDocument): ScadaDocument {
    const result = this.executeUndo(document);
    if (result.status === "failed") throw this.#executionError(result, "HISTORY_UNDO_FAILED");
    return result.document;
  }

  public redo(document: ScadaDocument): ScadaDocument {
    const result = this.executeRedo(document);
    if (result.status === "failed") throw this.#executionError(result, "HISTORY_REDO_FAILED");
    return result.document;
  }

  public executeUndo(document: ScadaDocument): HistoryExecutionResult {
    this.#assertActive();
    this.#mergeAllowed = false;
    if (this.#activeTransaction !== undefined)
      throw new HistoryError("HISTORY_TRANSACTION_ACTIVE", "Cannot undo during a transaction");
    const entry = this.#undo.at(-1);
    if (entry === undefined) return this.#result("not-available", document);
    const expected = entry.operations.at(-1)?.after;
    if (expected !== document)
      return this.#failure(
        "HISTORY_DOCUMENT_MISMATCH",
        "Undo document does not match the recorded history head",
        document,
        entry
      );
    return this.#executeEntry("undo", document, entry);
  }

  public executeRedo(document: ScadaDocument): HistoryExecutionResult {
    this.#assertActive();
    this.#mergeAllowed = false;
    if (this.#activeTransaction !== undefined)
      throw new HistoryError("HISTORY_TRANSACTION_ACTIVE", "Cannot redo during a transaction");
    const entry = this.#redo.at(-1);
    if (entry === undefined) return this.#result("not-available", document);
    const expected = entry.operations[0]?.before;
    if (expected !== document)
      return this.#failure(
        "HISTORY_DOCUMENT_MISMATCH",
        "Redo document does not match the recorded history head",
        document,
        entry
      );
    return this.#executeEntry("redo", document, entry);
  }

  public beginTransaction(options: HistoryTransactionOptions = {}): HistoryTransactionHandle {
    this.#assertActive();
    if (this.#activeTransaction !== undefined)
      throw new HistoryError("HISTORY_TRANSACTION_ACTIVE", "Nested transactions are not supported");
    this.#mergeAllowed = false;
    const id = `transaction-${++this.#transactionSequence}`;
    const state = { value: "active" as HistoryTransactionState };
    this.#activeTransaction = {
      id,
      options: freezeTransactionOptions(options),
      operations: [],
      state
    };
    this.#transition("transaction-started");
    return Object.freeze({
      id,
      get state(): HistoryTransactionState {
        return state.value;
      },
      commit: (): HistoryTransactionResult => {
        if (state.value !== "active") throw this.#invalidTransaction(id, state.value);
        return this.#commitTransaction(id);
      },
      cancel: (): HistoryTransactionResult => {
        if (state.value !== "active") throw this.#invalidTransaction(id, state.value);
        return this.#cancelTransaction(id);
      }
    });
  }

  public clear(): void {
    this.#assertActive();
    if (this.#activeTransaction !== undefined)
      throw new HistoryError(
        "HISTORY_TRANSACTION_ACTIVE",
        "Cancel or commit the active transaction before clearing history"
      );
    if (this.#undo.length === 0 && this.#redo.length === 0) return;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#entryCosts.clear();
    this.#estimatedUndoBytes = 0;
    this.#estimatedRedoBytes = 0;
    this.#mergeAllowed = false;
    this.#transition("cleared");
  }

  public subscribe(listener: HistoryListener): HistorySubscription {
    this.#assertActive();
    this.#listeners.add(listener);
    let closed = false;
    return {
      get closed(): boolean {
        return closed;
      },
      unsubscribe: (): void => {
        if (closed) return;
        closed = true;
        this.#listeners.delete(listener);
      }
    };
  }

  public dispose(): void {
    if (this.#disposed) return;
    if (this.#activeTransaction !== undefined) this.#activeTransaction.state.value = "cancelled";
    this.#activeTransaction = undefined;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#entryCosts.clear();
    this.#estimatedUndoBytes = 0;
    this.#estimatedRedoBytes = 0;
    this.#totalPrunedEntries = 0;
    this.#totalDiscardedRedoEntries = 0;
    this.#costEstimationFailureCount = 0;
    this.#mergeAllowed = false;
    this.#disposed = true;
    this.#transition("disposed");
    this.#listeners.clear();
  }

  #commitEntry(
    operations: readonly HistoryOperation[],
    options?: HistoryTransactionOptions,
    transactionId?: string,
    eventType: HistoryEventType = "recorded"
  ): HistoryEntry {
    const sequence = ++this.#sequence;
    let entry: HistoryEntry = Object.freeze({
      id: `history-${sequence}`,
      sequence,
      ...(options?.label === undefined ? {} : { label: options.label }),
      ...(options?.mergeKey === undefined ? {} : { mergeKey: options.mergeKey }),
      ...(options?.metadata === undefined ? {} : { transactionMetadata: options.metadata }),
      ...(transactionId === undefined ? {} : { transactionId }),
      operations: Object.freeze([...operations]),
      diagnostics: Object.freeze(this.#pendingDiagnostics.splice(0))
    });
    const estimation = this.#estimateEntry(entry);
    if (estimation.diagnostic !== undefined)
      entry = Object.freeze({
        ...entry,
        diagnostics: Object.freeze([...entry.diagnostics, estimation.diagnostic])
      });
    if (this.#maxEstimatedBytes !== undefined && estimation.cost > this.#maxEstimatedBytes)
      entry = Object.freeze({
        ...entry,
        diagnostics: Object.freeze([
          ...entry.diagnostics,
          Object.freeze({
            code: "HISTORY_OVERSIZED_ENTRY_RETAINED",
            severity: "warning",
            message:
              "Newest atomic history entry exceeds the estimated byte budget and was retained",
            recoverable: true
          })
        ])
      });
    this.#discardRedo();
    if (this.#maxEntries > 0) {
      this.#undo.push(entry);
      this.#entryCosts.set(entry, estimation.cost);
      this.#estimatedUndoBytes += estimation.cost;
      this.#enforceRetention(entry);
    }
    this.#mergeAllowed = transactionId === undefined;
    this.#transition(eventType, entry);
    return entry;
  }

  #commitTransaction(id: string): HistoryTransactionResult {
    this.#assertActive();
    const transaction = this.#requireTransaction(id);
    if (!this.#isValidTransaction(transaction)) {
      transaction.state.value = "failed";
      this.#activeTransaction = undefined;
      this.#transition("transaction-failed");
      throw new HistoryError(
        "HISTORY_TRANSACTION_COMMIT_FAILED",
        `Transaction ${id} contains an invalid or discontinuous operation sequence`
      );
    }
    transaction.state.value = "committed";
    this.#activeTransaction = undefined;
    if (transaction.operations.length === 0) {
      this.#transition("transaction-committed");
      return Object.freeze({ committed: false, state: "committed" });
    }
    const entry = this.#commitEntry(
      transaction.operations,
      transaction.options,
      id,
      "transaction-committed"
    );
    this.#mergeAllowed = false;
    return Object.freeze({ committed: true, state: "committed", entry });
  }

  #cancelTransaction(id: string): HistoryTransactionResult {
    this.#assertActive();
    const transaction = this.#requireTransaction(id);
    transaction.state.value = "cancelled";
    this.#activeTransaction = undefined;
    this.#mergeAllowed = false;
    this.#transition("transaction-cancelled");
    return Object.freeze({ committed: false, state: "cancelled" });
  }

  #isValidTransaction(transaction: ActiveTransaction): boolean {
    for (const [index, operation] of transaction.operations.entries()) {
      if (
        typeof operation.command.execute !== "function" ||
        typeof operation.command.undo !== "function" ||
        typeof operation.command.redo !== "function"
      )
        return false;
      const next = transaction.operations[index + 1];
      if (next !== undefined && operation.after !== next.before) return false;
    }
    return true;
  }

  #tryMergeCommitted(next: HistoryOperation): boolean {
    if (!this.#mergeAllowed || this.#redo.length > 0) return false;
    const entry = this.#undo.at(-1);
    if (entry === undefined || entry.transactionId !== undefined || entry.operations.length !== 1)
      return false;
    const previous = entry.operations[0];
    if (previous === undefined) return false;
    const result = this.#mergeOperations(previous, next);
    if (result.kind === "separate") return false;
    this.#discardRedo();
    if (result.kind === "remove") {
      const removed = this.#undo.pop();
      if (removed !== undefined) this.#releaseEntry(removed, "undo");
      this.#noOpRemovalCount++;
      this.#mergeAllowed = false;
      this.#transition("compressed");
      return true;
    }
    let mergedEntry: HistoryEntry = Object.freeze({
      ...entry,
      operations: Object.freeze([result.operation]),
      diagnostics: Object.freeze([...entry.diagnostics, ...result.diagnostics])
    });
    const estimation = this.#estimateEntry(mergedEntry);
    if (estimation.diagnostic !== undefined)
      mergedEntry = Object.freeze({
        ...mergedEntry,
        diagnostics: Object.freeze([...mergedEntry.diagnostics, estimation.diagnostic])
      });
    if (this.#maxEstimatedBytes !== undefined && estimation.cost > this.#maxEstimatedBytes)
      mergedEntry = Object.freeze({
        ...mergedEntry,
        diagnostics: Object.freeze([
          ...mergedEntry.diagnostics,
          Object.freeze({
            code: "HISTORY_OVERSIZED_ENTRY_RETAINED",
            severity: "warning",
            message:
              "Newest atomic history entry exceeds the estimated byte budget and was retained",
            recoverable: true
          })
        ])
      });
    const oldCost = this.#entryCosts.get(entry) ?? 0;
    this.#entryCosts.delete(entry);
    this.#entryCosts.set(mergedEntry, estimation.cost);
    this.#estimatedUndoBytes += estimation.cost - oldCost;
    this.#undo[this.#undo.length - 1] = mergedEntry;
    this.#enforceRetention(mergedEntry);
    this.#mergeCount++;
    this.#transition("merged", mergedEntry);
    return true;
  }

  #appendOperation(
    operations: HistoryOperation[],
    next: HistoryOperation,
    allowRemoval: boolean
  ): void {
    const previous = operations.at(-1);
    if (previous === undefined) {
      operations.push(next);
      return;
    }
    const result = this.#mergeOperations(previous, next);
    if (result.kind === "separate") {
      operations.push(next);
      return;
    }
    if (result.kind === "remove") {
      if (allowRemoval || operations.length > 1) operations.pop();
      else operations[operations.length - 1] = result.fallback;
      this.#noOpRemovalCount++;
      return;
    }
    operations[operations.length - 1] = result.operation;
    this.#mergeCount++;
  }

  #mergeOperations(
    previous: HistoryOperation,
    next: HistoryOperation
  ):
    | { readonly kind: "separate" }
    | { readonly kind: "remove"; readonly fallback: HistoryOperation }
    | {
        readonly kind: "merge";
        readonly operation: HistoryOperation;
        readonly diagnostics: readonly HistoryDiagnostic[];
      } {
    if (!this.#compression.enabled || !this.#compression.mergeAdjacentCommands)
      return { kind: "separate" };
    const left = previous.merge;
    const right = next.merge;
    if (
      left === undefined ||
      right === undefined ||
      left.policy === "never" ||
      right.policy === "never" ||
      left.key !== right.key ||
      left.commandKind !== right.commandKind ||
      left.groupId !== right.groupId ||
      !sameTargets(left.targetIds, right.targetIds) ||
      previous.after !== next.before
    )
      return { kind: "separate" };
    const previousTime = parseTimestamp(previous.command.timestamp);
    const nextTime = parseTimestamp(next.command.timestamp);
    if (
      this.#compression.maxIntervalMs !== Number.POSITIVE_INFINITY &&
      (previousTime === undefined ||
        nextTime === undefined ||
        nextTime < previousTime ||
        nextTime - previousTime > this.#compression.maxIntervalMs)
    )
      return { kind: "separate" };
    let compatible = false;
    try {
      compatible = previous.command.canMergeWith(next.command);
    } catch {
      this.#recordMergeFailure();
      return { kind: "separate" };
    }
    if (!compatible) return { kind: "separate" };
    try {
      const command = new CompressedHistoryCommand(previous, next, next.command);
      const operation = freezeOperation({
        command,
        before: previous.before,
        after: next.after,
        ...(this.#deriveChanges === undefined
          ? previous.changes === undefined || next.changes === undefined
            ? {}
            : { changes: mergeChangeSets(previous.changes, next.changes) }
          : { changes: this.#deriveChanges(previous.before, next.after) }),
        ...(this.#deriveChanges === undefined
          ? previous.undoChanges === undefined || next.undoChanges === undefined
            ? {}
            : { undoChanges: mergeChangeSets(next.undoChanges, previous.undoChanges) }
          : { undoChanges: this.#deriveChanges(next.after, previous.before) }),
        merge: left,
        ...(previous.restoration === undefined && next.restoration === undefined
          ? {}
          : {
              restoration: {
                ...(previous.restoration?.before === undefined
                  ? {}
                  : { before: previous.restoration.before }),
                ...(next.restoration?.after === undefined ? {} : { after: next.restoration.after })
              }
            })
      });
      if (this.#compression.removeNoOps && command.isHistoryNoOp(operation.before, operation.after))
        return { kind: "remove", fallback: operation };
      return { kind: "merge", operation, diagnostics: Object.freeze([]) };
    } catch {
      this.#recordMergeFailure();
      return { kind: "separate" };
    }
  }

  #recordMergeFailure(): void {
    this.#mergeFailureCount++;
    this.#pendingDiagnostics.push(
      Object.freeze({
        code: "HISTORY_MERGE_FAILED",
        severity: "warning",
        message: "Compatible history operations could not be merged; both were retained",
        recoverable: true
      })
    );
  }

  #requireTransaction(id: string): ActiveTransaction {
    if (this.#activeTransaction?.id !== id) throw this.#invalidTransaction(id);
    return this.#activeTransaction;
  }

  #invalidTransaction(id: string, state?: HistoryTransactionState): HistoryError {
    return new HistoryError(
      "HISTORY_INVALID_TRANSACTION",
      `Transaction ${id} is not active${state === undefined ? "" : ` (${state})`}`
    );
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new HistoryError("HISTORY_DISPOSED", "History engine has been disposed", false);
  }

  #executeEntry(
    direction: "undo" | "redo",
    document: ScadaDocument,
    entry: HistoryEntry
  ): HistoryExecutionResult {
    if (this.#executing)
      return this.#failure(
        "HISTORY_BUSY",
        "History execution is already in progress",
        document,
        entry
      );
    this.#executing = true;
    try {
      let next = document;
      const operations = direction === "undo" ? [...entry.operations].reverse() : entry.operations;
      try {
        for (const operation of operations)
          next = operation.command[direction]({ document: next }).document;
      } catch {
        const code = direction === "undo" ? "HISTORY_UNDO_FAILED" : "HISTORY_REDO_FAILED";
        return this.#failure(
          code,
          `History ${direction} command execution failed`,
          document,
          entry
        );
      }
      if (direction === "undo") {
        this.#undo.pop();
        this.#redo.push(entry);
        const cost = this.#entryCosts.get(entry) ?? 0;
        this.#estimatedUndoBytes -= cost;
        this.#estimatedRedoBytes += cost;
      } else {
        this.#redo.pop();
        this.#undo.push(entry);
        const cost = this.#entryCosts.get(entry) ?? 0;
        this.#estimatedRedoBytes -= cost;
        this.#estimatedUndoBytes += cost;
      }
      const changeSets = operations
        .map((operation) => (direction === "undo" ? operation.undoChanges : operation.changes))
        .filter((changes): changes is DocumentChangeSet => changes !== undefined);
      const changes =
        changeSets.length === operations.length
          ? mergeChangeSets(...changeSets)
          : this.#deriveChanges?.(document, next);
      this.#transition(direction === "undo" ? "undone" : "redone", entry);
      return this.#result("applied", next, entry, changes);
    } finally {
      this.#executing = false;
    }
  }

  #result(
    status: HistoryExecutionResult["status"],
    document: ScadaDocument,
    entry?: HistoryEntry,
    changes?: DocumentChangeSet,
    diagnostics: HistoryExecutionResult["diagnostics"] = Object.freeze([])
  ): HistoryExecutionResult {
    return Object.freeze({
      status,
      document,
      ...(changes === undefined ? {} : { changes }),
      ...(entry === undefined ? {} : { entry }),
      diagnostics,
      state: this.state
    });
  }

  #failure(
    code:
      "HISTORY_BUSY" | "HISTORY_DOCUMENT_MISMATCH" | "HISTORY_UNDO_FAILED" | "HISTORY_REDO_FAILED",
    message: string,
    document: ScadaDocument,
    entry?: HistoryEntry
  ): HistoryExecutionResult {
    const diagnostic = Object.freeze({
      code,
      severity: "error" as const,
      message,
      recoverable: true
    });
    return this.#result("failed", document, entry, undefined, Object.freeze([diagnostic]));
  }

  #executionError(
    result: HistoryExecutionResult,
    fallbackCode: "HISTORY_UNDO_FAILED" | "HISTORY_REDO_FAILED"
  ): HistoryError {
    const diagnostic = result.diagnostics[0];
    return new HistoryError(
      diagnostic?.code ?? fallbackCode,
      diagnostic?.message ?? "History execution failed"
    );
  }

  #transition(type?: HistoryEventType, entry?: HistoryEntry): void {
    this.#revision++;
    if (type !== undefined) this.#emit(type, entry);
  }

  #estimateEntry(entry: HistoryEntry): {
    readonly cost: number;
    readonly diagnostic?: HistoryDiagnostic;
  } {
    if (this.#costEstimator === undefined) return { cost: 0 };
    try {
      const cost = this.#costEstimator.estimate(entry);
      if (!Number.isFinite(cost) || cost < 0) throw new Error("invalid estimate");
      return { cost };
    } catch {
      this.#costEstimationFailureCount++;
      return {
        cost: 0,
        diagnostic: Object.freeze({
          code: "HISTORY_COST_ESTIMATION_FAILED",
          severity: "warning",
          message:
            "History entry cost estimation failed; the entry was retained with zero estimated cost",
          recoverable: true
        })
      };
    }
  }

  #enforceRetention(newest: HistoryEntry): void {
    while (
      this.#undo.length > this.#maxEntries ||
      (this.#maxEstimatedBytes !== undefined &&
        this.#estimatedUndoBytes > this.#maxEstimatedBytes &&
        this.#undo.length > 1)
    ) {
      const pruned = this.#undo.shift();
      if (pruned === undefined) break;
      this.#releaseEntry(pruned, "undo");
      this.#totalPrunedEntries++;
    }
    // The newest valid atomic entry is deliberately retained even when it alone exceeds the budget.
    void newest;
  }

  #discardRedo(): void {
    if (this.#redo.length === 0) return;
    this.#totalDiscardedRedoEntries += this.#redo.length;
    for (const entry of this.#redo) this.#entryCosts.delete(entry);
    this.#redo.length = 0;
    this.#estimatedRedoBytes = 0;
  }

  #releaseEntry(entry: HistoryEntry, stack: "undo" | "redo"): void {
    const cost = this.#entryCosts.get(entry) ?? 0;
    this.#entryCosts.delete(entry);
    if (stack === "undo") this.#estimatedUndoBytes -= cost;
    else this.#estimatedRedoBytes -= cost;
  }

  #emit(type: HistoryEventType, entry?: HistoryEntry): void {
    const event: HistoryEvent = Object.freeze({
      type,
      state: this.state,
      ...(entry === undefined ? {} : { entry })
    });
    for (const listener of [...this.#listeners]) listener(event);
  }
}
