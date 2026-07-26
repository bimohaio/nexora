import type { JsonValue, Medium, PortDirection } from "./model.js";

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
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export function arePortDirectionsCompatible(source: PortDirection, target: PortDirection): boolean {
  if (source === "passive" || target === "passive") return source === target;
  return (
    (source === "output" && (target === "input" || target === "bidirectional")) ||
    (source === "bidirectional" && (target === "input" || target === "bidirectional"))
  );
}

export function arePortMediumsCompatible(source: PortDefinition, target: PortDefinition): boolean {
  return (
    (source.medium === "generic" ||
      target.medium === "generic" ||
      (source.acceptedMediums.length === 0
        ? source.medium === target.medium
        : source.acceptedMediums.includes(target.medium))) &&
    (source.medium === "generic" ||
      target.medium === "generic" ||
      (target.acceptedMediums.length === 0
        ? target.medium === source.medium
        : target.acceptedMediums.includes(source.medium)))
  );
}

export interface PortCompatibilityResult {
  readonly compatible: boolean;
  readonly reasonCode?: "PORT_DIRECTION_INCOMPATIBLE" | "PORT_MEDIUM_INCOMPATIBLE";
  readonly message: string;
}

export function checkPortCompatibility(
  source: PortDefinition,
  target: PortDefinition
): PortCompatibilityResult {
  if (!arePortDirectionsCompatible(source.direction, target.direction)) {
    return {
      compatible: false,
      reasonCode: "PORT_DIRECTION_INCOMPATIBLE",
      message: `Port directions ${source.direction} and ${target.direction} are incompatible.`
    };
  }
  if (!arePortMediumsCompatible(source, target)) {
    return {
      compatible: false,
      reasonCode: "PORT_MEDIUM_INCOMPATIBLE",
      message: `Port media ${source.medium} and ${target.medium} are incompatible.`
    };
  }
  return { compatible: true, message: "Ports are compatible." };
}
