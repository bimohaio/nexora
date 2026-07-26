import type { Medium, PortDirection } from "./model.js";

export interface NormalizedPortPosition {
  readonly x: number;
  readonly y: number;
}

export interface PortDefinition {
  readonly id: string;
  readonly label: string;
  readonly position: NormalizedPortPosition;
  readonly direction: PortDirection;
  readonly medium: Medium;
  readonly maxConnections?: number;
  readonly acceptedMediums: readonly Medium[];
  readonly acceptedDirections: readonly PortDirection[];
}

export function arePortDirectionsCompatible(source: PortDirection, target: PortDirection): boolean {
  if (source === "passive" || target === "passive") return true;
  if (source === "bidirectional" || target === "bidirectional") return true;
  return source === "output" && target === "input";
}

export function arePortMediumsCompatible(source: PortDefinition, target: PortDefinition): boolean {
  return (
    source.acceptedMediums.includes(target.medium) && target.acceptedMediums.includes(source.medium)
  );
}
