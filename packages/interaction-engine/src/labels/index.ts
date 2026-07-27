import type { AccessibleNameSources } from "../types/accessibility.js";

function metadataName(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  if (metadata === undefined) return undefined;
  for (const key of ["accessibleName", "label", "displayName", "name", "title"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export function computeAccessibleName(sources: Readonly<AccessibleNameSources>): string {
  const explicit = sources.explicitLabel?.trim();
  const fallback = sources.fallbackName?.trim();
  return (
    (explicit === "" ? undefined : explicit) ??
    metadataName(sources.symbolMetadata) ??
    metadataName(sources.propertyMetadata) ??
    metadataName(sources.pluginMetadata) ??
    (fallback === "" ? undefined : fallback) ??
    sources.id ??
    "Unnamed"
  );
}
