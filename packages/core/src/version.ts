import { SCADA_SCHEMA_VERSION } from "./model.js";

export interface SchemaVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSchemaVersion(value: string): SchemaVersion | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (match === null) return undefined;
  const [, major, minor, patch] = match;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

export function compareSchemaVersions(left: string, right: string): -1 | 0 | 1 | undefined {
  const a = parseSchemaVersion(left);
  const b = parseSchemaVersion(right);
  if (a === undefined || b === undefined) return undefined;
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}

export function isSupportedSchemaVersion(version: string): boolean {
  return version === SCADA_SCHEMA_VERSION;
}
