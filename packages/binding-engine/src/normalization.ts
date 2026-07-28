import type { BindingDefinition } from "./contracts.js";

export function normalizeBindingDefinition(
  binding: Readonly<BindingDefinition>
): BindingDefinition {
  const source =
    binding.source.type === "tag"
      ? { ...binding.source, tagId: binding.source.tagId.trim() }
      : binding.source.type === "variable"
        ? { ...binding.source, variableId: binding.source.variableId.trim() }
        : { ...binding.source };
  return {
    ...binding,
    id: binding.id.trim(),
    source,
    target: { ...binding.target },
    mode: "one-way",
    enabled: binding.enabled,
    ...(binding.formatter === undefined
      ? {}
      : {
          formatter: {
            ...binding.formatter,
            ...(binding.formatter.options === undefined
              ? {}
              : { options: { ...binding.formatter.options } })
          }
        }),
    ...(binding.transformation === undefined
      ? {}
      : {
          transformation: {
            ...binding.transformation,
            ...(binding.transformation.options === undefined
              ? {}
              : { options: { ...binding.transformation.options } })
          }
        }),
    ...(binding.extensions === undefined ? {} : { extensions: { ...binding.extensions } })
  };
}
