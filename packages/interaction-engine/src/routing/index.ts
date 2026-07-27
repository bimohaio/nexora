import { KeyboardDiagnostics } from "../diagnostics/keyboard-diagnostics.js";
import { CommandRoutingError } from "../errors/index.js";
import type { KeyMap } from "../maps/index.js";
import type {
  CommandRouteContext,
  CommandRouteResult,
  KeyboardCommand,
  NormalizedKey
} from "../types/keyboard.js";

export type KeyboardCommandHandler = (
  command: KeyboardCommand,
  context: Readonly<CommandRouteContext>
) => boolean | undefined;

export interface CommandRouterOptions {
  readonly handlers?: Readonly<Record<string, KeyboardCommandHandler>>;
  readonly diagnostics?: KeyboardDiagnostics;
}

export class KeyboardCommandRouter {
  readonly #handlers = new Map<string, KeyboardCommandHandler>();
  readonly #diagnostics: KeyboardDiagnostics;
  #lastFingerprint = "";
  #disposed = false;
  public constructor(
    private readonly keyMap: KeyMap,
    options: CommandRouterOptions = {}
  ) {
    for (const [command, handler] of Object.entries(options.handlers ?? {}))
      this.#handlers.set(command, handler);
    this.#diagnostics = options.diagnostics ?? new KeyboardDiagnostics();
  }
  public register(command: KeyboardCommand, handler: KeyboardCommandHandler): () => void {
    this.#assertUsable();
    this.#handlers.set(command, handler);
    return () => this.#handlers.delete(command);
  }
  public resolve(key: NormalizedKey): KeyboardCommand | undefined {
    return this.keyMap.resolve(key.key, key.modifiers);
  }
  public route(key: NormalizedKey, context: Readonly<CommandRouteContext>): CommandRouteResult {
    this.#assertUsable();
    if (key.composing) return { handled: false };
    const command = this.resolve(key);
    if (command === undefined) return { handled: false };
    const fingerprint = `${key.timestamp}:${key.code}:${command}:${String(key.repeat)}`;
    if (fingerprint === this.#lastFingerprint) return { handled: false };
    this.#lastFingerprint = fingerprint;
    if (context.interactionActive && command !== "escape") return { handled: false, command };
    const result = this.#handlers.get(command)?.(command, context);
    this.#diagnostics.recordRoute();
    return { handled: result !== false, command };
  }
  public dispose(): void {
    this.#handlers.clear();
    this.#disposed = true;
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new CommandRoutingError("COMMAND_ROUTER_DISPOSED", "Command router is disposed.");
  }
}
