import {
  SystemClock,
  UlidEntityIdGenerator,
  type Clock,
  type EntityIdGenerator,
  type JsonValue,
  type PropertyBinding,
  type ScadaDocument
} from "@web-scada/core";
import {
  validateBindingDefinition,
  validateDocumentBindings,
  type BindingDiagnostic,
  type BindingValidationResult
} from "@web-scada/binding-engine";
import type {
  BindablePropertyMetadata,
  PropertyMetadata,
  SymbolRegistry
} from "@web-scada/symbols";
import { SnapshotCommand, type DesignerCommandDependencies } from "./commands.js";
import type { DesignerEngine } from "./contracts.js";

export type BindingDefinition = PropertyBinding;

export interface BindingMutationResult {
  readonly success: boolean;
  readonly binding?: BindingDefinition;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface BindingPropertyDescriptor {
  readonly nodeId: string;
  readonly key: string;
  readonly labelKey: string;
  readonly editor: PropertyMetadata["kind"];
  readonly bindable: boolean;
  readonly dataTypes: readonly ("boolean" | "number" | "string")[];
  readonly currentValue?: JsonValue;
  readonly binding?: BindingDefinition;
}

/** A renderer-independent preview. It describes authoring intent and never evaluates a source. */
export interface BindingPreview {
  readonly bindingId: string;
  readonly sourceLabel: string;
  readonly targetLabel: string;
  readonly enabled: boolean;
  readonly fallback?: JsonValue;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface BindingExport {
  readonly kind: "web-scada-bindings";
  readonly version: 1;
  readonly bindings: readonly BindingDefinition[];
}

export interface BindingAuthoringOptions {
  readonly designer: DesignerEngine;
  readonly symbols: SymbolRegistry;
  readonly idGenerator?: EntityIdGenerator;
  readonly clock?: Clock;
}

function sourceLabel(binding: BindingDefinition): string {
  switch (binding.source.type) {
    case "tag":
      return `Tag: ${binding.source.tagId}`;
    case "variable":
      return `Variable: ${binding.source.variableId}`;
    case "constant":
      return `Constant: ${JSON.stringify(binding.source.value)}`;
    case "expression":
      return "Expression (evaluated at runtime)";
  }
}

function targetLabel(binding: BindingDefinition): string {
  const target = binding.target;
  if (target.type === "node-property") return `${target.nodeId}.${target.property}`;
  if (target.type === "connection-property") return `${target.connectionId}.${target.property}`;
  if (target.type === "node-state") return `${target.nodeId}.state`;
  if (target.type === "visibility") return `${target.entityId}.visible`;
  return `${target.nodeId}.text`;
}

function parseBindingExport(input: unknown): BindingExport | undefined {
  try {
    const value: unknown = typeof input === "string" ? JSON.parse(input) : input;
    if (
      typeof value !== "object" ||
      value === null ||
      !("kind" in value) ||
      value.kind !== "web-scada-bindings" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("bindings" in value) ||
      !Array.isArray(value.bindings)
    )
      return undefined;
    return value as unknown as BindingExport;
  } catch {
    return undefined;
  }
}

export class BindingAuthoringService {
  readonly #designer: DesignerEngine;
  readonly #symbols: SymbolRegistry;
  readonly #ids: EntityIdGenerator;
  readonly #dependencies: DesignerCommandDependencies;

  public constructor(options: BindingAuthoringOptions) {
    this.#designer = options.designer;
    this.#symbols = options.symbols;
    this.#ids = options.idGenerator ?? new UlidEntityIdGenerator();
    this.#dependencies = {
      idGenerator: this.#ids,
      clock: options.clock ?? new SystemClock(),
      symbolRegistry: options.symbols
    };
  }

  public list(): readonly BindingDefinition[] {
    return this.#designer.getState().document.bindings;
  }

  public get(id: string): BindingDefinition | undefined {
    return this.list().find((binding) => binding.id === id);
  }

  public validate(binding: BindingDefinition): BindingValidationResult {
    return validateBindingDefinition(binding, { document: this.#designer.getState().document });
  }

  public validateDocument(): BindingValidationResult {
    return validateDocumentBindings(this.#designer.getState().document);
  }

  public create(
    definition: Omit<BindingDefinition, "id"> & { readonly id?: string }
  ): BindingMutationResult {
    const binding: BindingDefinition = {
      ...definition,
      id: definition.id ?? this.#ids.createBindingId()
    };
    if (this.get(binding.id) !== undefined)
      return {
        success: false,
        diagnostics: [
          {
            code: "BINDING_DUPLICATE_ID",
            severity: "error",
            message: `Duplicate binding ID: ${binding.id}`,
            bindingId: binding.id,
            recoverable: true
          }
        ]
      };
    return this.#commitCandidate(binding, (document) => {
      const nodeId = "nodeId" in binding.target ? binding.target.nodeId : undefined;
      return {
        ...document,
        bindings: [...document.bindings, binding],
        nodes:
          nodeId === undefined
            ? document.nodes
            : document.nodes.map((node) =>
                node.id === nodeId && !node.bindings.includes(binding.id)
                  ? { ...node, bindings: [...node.bindings, binding.id] }
                  : node
              )
      };
    });
  }

  public update(id: string, update: Partial<Omit<BindingDefinition, "id">>): BindingMutationResult {
    const current = this.get(id);
    if (current === undefined) return this.#notFound(id);
    const binding: BindingDefinition = { ...current, ...update, id };
    return this.#commitCandidate(binding, (document) => {
      const targetNodeId = "nodeId" in binding.target ? binding.target.nodeId : undefined;
      return {
        ...document,
        bindings: document.bindings.map((entry) => (entry.id === id ? binding : entry)),
        nodes: document.nodes.map((node) => {
          const without = node.bindings.filter((bindingId) => bindingId !== id);
          return node.id === targetNodeId
            ? { ...node, bindings: [...without, id] }
            : without.length === node.bindings.length
              ? node
              : { ...node, bindings: without };
        })
      };
    });
  }

  public remove(id: string): BindingMutationResult {
    const binding = this.get(id);
    if (binding === undefined) return this.#notFound(id);
    this.#execute((document) => ({
      ...document,
      bindings: document.bindings.filter((entry) => entry.id !== id),
      nodes: document.nodes.map((node) =>
        node.bindings.includes(id)
          ? { ...node, bindings: node.bindings.filter((bindingId) => bindingId !== id) }
          : node
      )
    }));
    return { success: true, binding, diagnostics: [] };
  }

  public duplicate(id: string): BindingMutationResult {
    const binding = this.get(id);
    if (binding === undefined) return this.#notFound(id);
    return this.create({ ...binding, id: this.#ids.createBindingId() });
  }

  public preview(bindingOrId: BindingDefinition | string): BindingPreview | undefined {
    const binding = typeof bindingOrId === "string" ? this.get(bindingOrId) : bindingOrId;
    if (binding === undefined) return undefined;
    const validation = this.validate(binding);
    return {
      bindingId: binding.id,
      sourceLabel: sourceLabel(binding),
      targetLabel: targetLabel(binding),
      enabled: binding.enabled,
      ...(binding.fallback === undefined ? {} : { fallback: binding.fallback }),
      diagnostics: validation.diagnostics
    };
  }

  public properties(nodeId: string): readonly BindingPropertyDescriptor[] {
    const document = this.#designer.getState().document;
    const node = document.nodes.find(({ id }) => id === nodeId);
    if (node === undefined) return [];
    const definition = this.#symbols.get(node.symbolType);
    if (definition === undefined) return [];
    const bindable = new Map<string, BindablePropertyMetadata>(
      definition.bindableProperties.map((metadata) => [metadata.key, metadata])
    );
    return definition.editableProperties.map((metadata) => {
      const binding = document.bindings.find(
        ({ target }) =>
          target.type === "node-property" &&
          target.nodeId === nodeId &&
          target.property === metadata.key
      );
      return {
        nodeId,
        key: metadata.key,
        labelKey: metadata.labelKey,
        editor: metadata.kind,
        bindable: metadata.bindable === true || bindable.has(metadata.key),
        dataTypes: bindable.get(metadata.key)?.dataTypes ?? [],
        ...(node.properties[metadata.key] === undefined
          ? {}
          : { currentValue: node.properties[metadata.key] }),
        ...(binding === undefined ? {} : { binding })
      };
    });
  }

  public export(ids?: readonly string[], pretty = false): string {
    const selected =
      ids === undefined ? this.list() : this.list().filter(({ id }) => ids.includes(id));
    return JSON.stringify(
      { kind: "web-scada-bindings", version: 1, bindings: selected } satisfies BindingExport,
      undefined,
      pretty ? 2 : undefined
    );
  }

  public import(input: unknown): BindingMutationResult {
    const payload = parseBindingExport(input);
    if (payload === undefined)
      return {
        success: false,
        diagnostics: [
          {
            code: "BINDING_INVALID_DEFINITION",
            severity: "error",
            message: "Invalid binding import payload.",
            recoverable: true
          }
        ]
      };
    let candidate = this.#designer.getState().document;
    const imported: BindingDefinition[] = [];
    for (const source of payload.bindings) {
      const binding =
        this.get(source.id) === undefined ? source : { ...source, id: this.#ids.createBindingId() };
      const validation = validateBindingDefinition(binding, { document: candidate });
      if (!validation.valid) return { success: false, diagnostics: validation.diagnostics };
      imported.push(binding);
      candidate = { ...candidate, bindings: [...candidate.bindings, binding] };
    }
    const documentValidation = validateDocumentBindings(candidate);
    if (!documentValidation.valid)
      return { success: false, diagnostics: documentValidation.diagnostics };
    this.#execute((document) => ({
      ...document,
      bindings: [...document.bindings, ...imported],
      nodes: document.nodes.map((node) => {
        const ids = imported
          .filter(({ target }) => "nodeId" in target && target.nodeId === node.id)
          .map(({ id }) => id);
        return ids.length === 0 ? node : { ...node, bindings: [...node.bindings, ...ids] };
      })
    }));
    const first = imported[0];
    return {
      success: true,
      ...(first === undefined ? {} : { binding: first }),
      diagnostics: []
    };
  }

  #commitCandidate(
    binding: BindingDefinition,
    operation: (document: ScadaDocument) => ScadaDocument
  ): BindingMutationResult {
    const validation = this.validate(binding);
    if (!validation.valid) return { success: false, diagnostics: validation.diagnostics };
    this.#execute(operation);
    return { success: true, binding, diagnostics: [] };
  }

  #execute(operation: (document: ScadaDocument) => ScadaDocument): void {
    this.#designer.execute(new SnapshotCommand("update-property", operation, this.#dependencies));
  }

  #notFound(id: string): BindingMutationResult {
    return {
      success: false,
      diagnostics: [
        {
          code: "BINDING_REFERENCE_NOT_FOUND",
          severity: "error",
          message: `Binding not found: ${id}`,
          bindingId: id,
          recoverable: true
        }
      ]
    };
  }
}
