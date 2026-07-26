import type { ScadaDocument } from "./model.js";

export type CommandType =
  | "add-node"
  | "move-node"
  | "resize-node"
  | "rotate-node"
  | "delete-node"
  | "create-connection"
  | "delete-connection"
  | "update-property";

export interface CommandContext {
  readonly document: ScadaDocument;
}

export interface CommandResult {
  readonly document: ScadaDocument;
}

export interface Command {
  readonly id: string;
  readonly type: CommandType;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  execute(context: CommandContext): CommandResult;
  undo(context: CommandContext): CommandResult;
  redo(context: CommandContext): CommandResult;
  canMergeWith(command: Command): boolean;
}
