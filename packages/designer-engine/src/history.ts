import type { Command, ScadaDocument } from "@web-scada/core";

interface HistoryEntry {
  readonly command: Command;
  readonly before: ScadaDocument;
  readonly after: ScadaDocument;
}

export class CommandHistory {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];

  public execute(command: Command, document: ScadaDocument): ScadaDocument {
    const after = command.execute({ document }).document;
    if (after === document) return document;
    this.#undo.push({ command, before: document, after });
    this.#redo.length = 0;
    return after;
  }

  public undo(document: ScadaDocument): ScadaDocument {
    const entry = this.#undo.pop();
    if (entry === undefined) return document;
    const before = entry.command.undo({ document }).document;
    this.#redo.push({ ...entry, before, after: document });
    return before;
  }

  public redo(document: ScadaDocument): ScadaDocument {
    const entry = this.#redo.pop();
    if (entry === undefined) return document;
    const after = entry.command.redo({ document }).document;
    this.#undo.push({ ...entry, before: document, after });
    return after;
  }

  public get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  public get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  public clear(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
  }
}
