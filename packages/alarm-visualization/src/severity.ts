import type {
  AlarmId,
  AlarmSeverity,
  AlarmSeverityDefinition,
  AlarmSeverityId,
  AlarmSeverityRegistry
} from "./contracts.js";
import { AlarmSeverityError } from "./errors.js";

export function asAlarmSeverityId(value: string): AlarmSeverityId {
  return value as AlarmSeverityId;
}
export function asAlarmId(value: string): AlarmId {
  return value as AlarmId;
}
export const BUILTIN_ALARM_SEVERITIES: Readonly<Record<AlarmSeverity, AlarmSeverityDefinition>> = {
  information: { id: asAlarmSeverityId("information"), rank: 10, displayName: "Information" },
  warning: { id: asAlarmSeverityId("warning"), rank: 20, displayName: "Warning" },
  alarm: { id: asAlarmSeverityId("alarm"), rank: 30, displayName: "Alarm" },
  critical: { id: asAlarmSeverityId("critical"), rank: 40, displayName: "Critical" }
};

export class InMemoryAlarmSeverityRegistry implements AlarmSeverityRegistry {
  readonly #definitions = new Map<AlarmSeverityId, AlarmSeverityDefinition>();
  public constructor(includeBuiltins = true) {
    if (includeBuiltins)
      for (const definition of Object.values(BUILTIN_ALARM_SEVERITIES)) this.register(definition);
  }
  public register(definition: AlarmSeverityDefinition): void {
    if (
      definition.id.trim() === "" ||
      definition.displayName.trim() === "" ||
      !Number.isFinite(definition.rank)
    )
      throw new AlarmSeverityError("Alarm severity definition is invalid.", {
        code: "ALARM_SEVERITY_INVALID"
      });
    if (this.#definitions.has(definition.id))
      throw new AlarmSeverityError(`Alarm severity is already registered: ${definition.id}`, {
        code: "ALARM_SEVERITY_DUPLICATE"
      });
    this.#definitions.set(definition.id, Object.freeze({ ...definition }));
  }
  public get(id: AlarmSeverityId): AlarmSeverityDefinition | undefined {
    return this.#definitions.get(id);
  }
  public rank(id: AlarmSeverityId): number | undefined {
    return this.get(id)?.rank;
  }
  public list(): readonly AlarmSeverityDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort(
        (left, right) => left.rank - right.rank || left.id.localeCompare(right.id)
      )
    );
  }
}
