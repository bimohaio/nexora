import { isJsonValue, type ScadaDocument } from "@web-scada/core";
import type {
  BindingDefinition,
  BindingDiagnostic,
  BindingOwnerReference,
  BindingTargetDefinition
} from "./contracts.js";
import { validateValueFormat, type ValueFormatDefinition } from "./formatting.js";
import { validateValueMapping, type ValueMappingDefinition } from "./mapping.js";

export interface BindingValidationContext {
  readonly document?: Readonly<ScadaDocument>;
  readonly knownBindingTypes?: ReadonlySet<string>;
}

export interface BindingValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export function getBindingOwner(binding: Readonly<BindingDefinition>): BindingOwnerReference {
  const target = binding.target;
  if ("nodeId" in target) return { kind: "node", nodeId: target.nodeId };
  if ("connectionId" in target) return { kind: "connection", connectionId: target.connectionId };
  return { kind: "extension", namespace: "entity", entityId: target.entityId };
}

function targetExists(target: BindingTargetDefinition, document: Readonly<ScadaDocument>): boolean {
  if ("nodeId" in target) return document.nodes.some(({ id }) => id === target.nodeId);
  if ("connectionId" in target)
    return document.connections.some(({ id }) => id === target.connectionId);
  return (
    document.nodes.some(({ id }) => id === target.entityId) ||
    document.connections.some(({ id }) => id === target.entityId)
  );
}

export function validateBindingDefinition(
  binding: Readonly<BindingDefinition>,
  context: Readonly<BindingValidationContext> = {}
): BindingValidationResult {
  const diagnostics: BindingDiagnostic[] = [];
  const add = (
    message: string,
    path: string,
    code: BindingDiagnostic["code"] = "BINDING_INVALID_DEFINITION"
  ): void => {
    diagnostics.push({
      code,
      severity: "error",
      message,
      bindingId: binding.id,
      path,
      recoverable: true
    });
  };
  if (binding.id.trim() === "") add("Binding ID is required.", "/id");
  if (!isJsonValue(binding)) add("Binding definition must be JSON-safe.", "");
  if (binding.source.type === "tag" && binding.source.tagId.trim() === "")
    add("Runtime tag ID is required.", "/source/tagId");
  if (binding.source.type === "variable" && binding.source.variableId.trim() === "")
    add("Variable ID is required.", "/source/variableId");
  if (binding.source.type === "variable" && context.document !== undefined) {
    const variableId = binding.source.variableId;
    if (!context.document.variables.some(({ id }) => id === variableId))
      add(
        "Referenced variable does not exist.",
        "/source/variableId",
        "BINDING_REFERENCE_NOT_FOUND"
      );
  }
  if (context.document !== undefined && !targetExists(binding.target, context.document))
    add("Binding target does not exist.", "/target", "BINDING_OWNER_NOT_FOUND");
  if (binding.transformation !== undefined) {
    if (binding.transformation.type !== "exact-value")
      add(
        "Unsupported binding transformation type.",
        "/transformation/type",
        "BINDING_MAPPING_INVALID_DEFINITION"
      );
    else
      diagnostics.push(
        ...validateValueMapping({
          ...(binding.transformation.options as unknown as ValueMappingDefinition),
          type: "exact-value"
        }).map((entry) => ({
          ...entry,
          bindingId: binding.id,
          path: `/transformation/options${entry.path ?? ""}`
        }))
      );
  }
  if (binding.formatter !== undefined)
    diagnostics.push(
      ...validateValueFormat({
        ...(binding.formatter.options as unknown as Omit<ValueFormatDefinition, "type">),
        type: binding.formatter.type
      } as ValueFormatDefinition).map((entry) => ({
        ...entry,
        bindingId: binding.id,
        path: `/formatter/options${entry.path ?? ""}`
      }))
    );
  return { valid: diagnostics.length === 0, diagnostics: Object.freeze(diagnostics) };
}

export function validateDocumentBindings(
  document: Readonly<ScadaDocument>
): BindingValidationResult {
  const diagnostics: BindingDiagnostic[] = [];
  const seen = new Set<string>();
  for (const binding of document.bindings) {
    if (seen.has(binding.id))
      diagnostics.push({
        code: "BINDING_DUPLICATE_ID",
        severity: "error",
        message: `Duplicate binding ID: ${binding.id}`,
        bindingId: binding.id,
        recoverable: true
      });
    seen.add(binding.id);
    diagnostics.push(...validateBindingDefinition(binding, { document }).diagnostics);
  }
  return { valid: diagnostics.length === 0, diagnostics: Object.freeze(diagnostics) };
}
