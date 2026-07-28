import type { BindingDefinition } from "./contracts.js";
import type { BindingDependency, BindingOwnerReference } from "./contracts.js";

function component(value: string): string {
  return `${String(value.length)}:${value}`;
}

function ownerKey(owner: BindingOwnerReference): string {
  switch (owner.kind) {
    case "document":
    case "canvas":
      return `${owner.kind}:${component(owner.documentId)}`;
    case "layer":
      return `layer:${component(owner.layerId)}`;
    case "node":
      return `node:${component(owner.nodeId)}`;
    case "connection":
      return `connection:${component(owner.connectionId)}`;
    case "extension":
      return `extension:${component(owner.namespace)}:${component(owner.entityId)}`;
  }
}

export function getBindingDependencyKey(dependency: Readonly<BindingDependency>): string {
  switch (dependency.kind) {
    case "runtime-value":
      return `runtime-value:${component(dependency.key)}`;
    case "binding":
      return `binding:${component(dependency.bindingId)}`;
    case "document-property":
      return `document-property:${ownerKey(dependency.owner)}:${component(dependency.propertyKey)}`;
    case "environment":
      return `environment:${component(dependency.key)}`;
  }
}

export function normalizeBindingDependencies(
  dependencies: readonly Readonly<BindingDependency>[]
): readonly BindingDependency[] {
  const byKey = new Map<string, BindingDependency>();
  for (const dependency of dependencies) byKey.set(getBindingDependencyKey(dependency), dependency);
  return Object.freeze(
    [...byKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, dependency]) => Object.freeze({ ...dependency }))
  );
}

export function getBindingDependencies(
  binding: Readonly<BindingDefinition>
): readonly BindingDependency[] {
  switch (binding.source.type) {
    case "tag":
      return Object.freeze([{ kind: "runtime-value", key: binding.source.tagId }]);
    case "variable":
      return Object.freeze([
        {
          kind: "document-property",
          owner: {
            kind: "extension",
            namespace: "core.variable",
            entityId: binding.source.variableId
          },
          propertyKey: "value"
        }
      ]);
    case "constant":
    case "expression":
      return Object.freeze([]);
  }
}
