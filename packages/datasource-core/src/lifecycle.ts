import type { DataSourceConnectionState } from "./contracts.js";
import { DataSourceError } from "./errors.js";

const TRANSITIONS: Readonly<
  Record<DataSourceConnectionState, readonly DataSourceConnectionState[]>
> = Object.freeze({
  idle: ["connecting", "disconnected", "disposed"],
  connecting: ["connected", "disconnecting", "failed", "disconnected", "disposed"],
  connected: ["disconnecting", "reconnecting", "failed", "disposed"],
  disconnecting: ["disconnected", "failed", "disposed"],
  disconnected: ["connecting", "disposed"],
  reconnecting: ["connecting", "connected", "failed", "disconnecting", "disconnected", "disposed"],
  failed: ["connecting", "reconnecting", "disconnecting", "disconnected", "disposed"],
  disposed: []
});

export function isValidConnectionTransition(
  from: DataSourceConnectionState,
  to: DataSourceConnectionState
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertConnectionTransition(
  from: DataSourceConnectionState,
  to: DataSourceConnectionState
): void {
  if (from === "disposed") {
    throw new DataSourceError("DATASOURCE_DISPOSED", "Disposed is a terminal state.");
  }
  if (!isValidConnectionTransition(from, to)) {
    throw new DataSourceError(
      "DATASOURCE_CONFIGURATION_ERROR",
      `Invalid data-source state transition from '${from}' to '${to}'.`
    );
  }
}
