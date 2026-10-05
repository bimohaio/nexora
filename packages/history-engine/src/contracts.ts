import type { Command, DocumentChangeSet, ScadaDocument } from "@web-scada/core";

export type HistoryErrorCode =
  | "HISTORY_DISPOSED"
  | "HISTORY_BUSY"
  | "HISTORY_DOCUMENT_MISMATCH"
  | "HISTORY_UNDO_FAILED"
  | "HISTORY_REDO_FAILED"
  | "HISTORY_INVALID_LIMIT"
  | "HISTORY_INVALID_TRANSACTION"
  | "HISTORY_TRANSACTION_COMMIT_FAILED"
  | "HISTORY_TRANSACTION_ACTIVE"
  | "HISTORY_INVALID_MERGE_POLICY"
  | "HISTORY_MERGE_FAILED"
  | "HISTORY_INVALID_MERGE_RESULT"
  | "HISTORY_COST_ESTIMATION_FAILED"
  | "HISTORY_OVERSIZED_ENTRY_RETAINED";

export interface HistoryDiagnostic {
  readonly code: HistoryErrorCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly recoverable: boolean;
}

/** JSON-safe, UI-neutral data interpreted by a higher-level editor adapter. */
export type HistoryRestorationValue =
  | null
  | boolean
  | number
  | string
  | readonly HistoryRestorationValue[]
  | { readonly [key: string]: HistoryRestorationValue };

export interface HistoryRestorationMetadata {
  readonly before?: HistoryRestorationValue;
  readonly after?: HistoryRestorationValue;
}

/** Semantic compatibility data only; timing never makes two operations compatible. */
export interface HistoryMergeMetadata {
  readonly key: string;
  readonly commandKind?: string;
  readonly targetIds?: readonly string[];
  readonly groupId?: string;
  readonly policy?: "never" | "compatible-neighbor";
}

/** Optional command capability. History never infers this data from command shape or type alone. */
export interface HistoryMergeableCommand extends Command {
  readonly historyMerge: HistoryMergeMetadata;
  /** Domain-specific equality used only after compatible commands have been combined. */
  isHistoryNoOp?(before: Readonly<ScadaDocument>, after: Readonly<ScadaDocument>): boolean;
}

export interface HistoryCompressionPolicy {
  /** Defaults to true; commands still require explicit semantic capability. */
  readonly enabled?: boolean;
  /** Defaults to true. */
  readonly mergeAdjacentCommands?: boolean;
  /** Defaults to true, but removal requires command-owned proof. */
  readonly removeNoOps?: boolean;
  /** Optional additional condition. Semantic compatibility is always required. */
  readonly maxIntervalMs?: number;
}

export interface HistoryCompressionStatistics {
  readonly mergeCount: number;
  readonly noOpRemovalCount: number;
  readonly mergeFailureCount: number;
}

export interface HistoryOperation {
  readonly command: Command;
  readonly before: ScadaDocument;
  readonly after: ScadaDocument;
  readonly changes?: DocumentChangeSet;
  /** Change set for applying the inverse operation, when supplied by the owner. */
  readonly undoChanges?: DocumentChangeSet;
  readonly merge?: HistoryMergeMetadata;
  readonly restoration?: HistoryRestorationMetadata;
}

/** Immutable logical unit. Sequence, rather than time, defines ordering. */
export interface HistoryEntry {
  readonly id: string;
  readonly sequence: number;
  readonly label?: string;
  readonly transactionId?: string;
  readonly mergeKey?: string;
  readonly transactionMetadata?: Readonly<Record<string, HistoryRestorationValue>>;
  readonly operations: readonly HistoryOperation[];
  readonly diagnostics: readonly HistoryDiagnostic[];
}

/** Deterministic estimate of History-owned retention cost; this is not JavaScript heap usage. */
export interface HistoryCostEstimator {
  estimate(entry: Readonly<HistoryEntry>): number;
}

export interface HistoryRetentionStatistics {
  readonly undoEntries: number;
  readonly redoEntries: number;
  readonly estimatedUndoBytes: number;
  readonly estimatedRedoBytes: number;
  readonly estimatedBytes: number;
  readonly totalPrunedEntries: number;
  readonly totalDiscardedRedoEntries: number;
  readonly costEstimationFailureCount: number;
}

export interface HistoryState {
  readonly revision: number;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly transactionDepth: 0 | 1;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDisposed: boolean;
}

export interface HistoryOptions {
  /** Maximum logical entries retained on the undo stack. Defaults to 100. */
  readonly maxEntries?: number;
  /** Optional estimated undo-stack budget. Requires a deterministic cost estimator. */
  readonly maxEstimatedBytes?: number;
  readonly costEstimator?: HistoryCostEstimator;
  /** Renderer-neutral adapter used when Core commands do not return change sets. */
  readonly deriveChanges?: (
    previous: Readonly<ScadaDocument>,
    next: Readonly<ScadaDocument>
  ) => DocumentChangeSet;
  readonly compression?: HistoryCompressionPolicy;
}

export type HistoryExecutionStatus = "applied" | "not-available" | "failed";

export interface HistoryExecutionResult {
  readonly status: HistoryExecutionStatus;
  readonly document: ScadaDocument;
  readonly changes?: DocumentChangeSet;
  readonly entry?: HistoryEntry;
  readonly diagnostics: readonly HistoryDiagnostic[];
  readonly state: HistoryState;
}

export interface HistoryTransactionOptions {
  readonly label?: string;
  readonly mergeKey?: string;
  readonly metadata?: Readonly<Record<string, HistoryRestorationValue>>;
}

export type HistoryTransactionState = "active" | "committed" | "cancelled" | "failed";

export interface HistoryTransactionResult {
  readonly committed: boolean;
  readonly state: Exclude<HistoryTransactionState, "active">;
  readonly entry?: HistoryEntry;
}

export interface HistoryTransactionHandle {
  readonly id: string;
  readonly state: HistoryTransactionState;
  commit(): HistoryTransactionResult;
  cancel(): HistoryTransactionResult;
}

export type HistoryEventType =
  | "recorded"
  | "undone"
  | "redone"
  | "cleared"
  | "transaction-started"
  | "transaction-committed"
  | "transaction-cancelled"
  | "transaction-failed"
  | "merged"
  | "compressed"
  | "merge-barrier"
  | "disposed";

export interface HistoryEvent {
  readonly type: HistoryEventType;
  readonly state: HistoryState;
  readonly entry?: HistoryEntry;
}

export type HistoryListener = (event: HistoryEvent) => void;

export interface HistorySubscription {
  readonly closed: boolean;
  unsubscribe(): void;
}
