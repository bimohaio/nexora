import {
  createIndustrialSymbolRegistry,
  createStandardSymbolCategoryRegistry,
  type InMemorySymbolRegistry,
  type SymbolCategoryRegistry
} from "@web-scada/symbols";
import type { ScadaDocument } from "@web-scada/core";
import {
  createInitialSvgSymbolRendererRegistry,
  type InMemorySvgSymbolRendererRegistry
} from "./symbol-renderers.js";

export interface SymbolEnvironment {
  readonly symbolRegistry: InMemorySymbolRegistry;
  readonly categoryRegistry: SymbolCategoryRegistry;
  readonly svgVisualRegistry: InMemorySvgSymbolRendererRegistry;
}

export interface SymbolDocumentDiagnostic {
  readonly code: "unknown-symbol" | "non-canonical-symbol" | "missing-svg-visual";
  readonly nodeId: string;
  readonly symbolType: string;
  readonly canonicalType?: string;
}

export interface SymbolDocumentValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly SymbolDocumentDiagnostic[];
}

/**
 * Production composition root for applications that want the complete built-in catalog.
 * Applications needing tree-shaking can create registries and register individual packs instead.
 */
export function createIndustrialSymbolEnvironment(): SymbolEnvironment {
  return {
    symbolRegistry: createIndustrialSymbolRegistry(),
    categoryRegistry: createStandardSymbolCategoryRegistry(),
    svgVisualRegistry: createInitialSvgSymbolRendererRegistry()
  };
}

export function validateDocumentSymbolEnvironment(
  document: Readonly<ScadaDocument>,
  environment: SymbolEnvironment
): SymbolDocumentValidationResult {
  const diagnostics: SymbolDocumentDiagnostic[] = [];
  for (const node of document.nodes) {
    const canonicalType = environment.symbolRegistry.resolveType(node.symbolType);
    if (canonicalType === undefined) {
      diagnostics.push({
        code: "unknown-symbol",
        nodeId: node.id,
        symbolType: node.symbolType
      });
      continue;
    }
    if (canonicalType !== node.symbolType)
      diagnostics.push({
        code: "non-canonical-symbol",
        nodeId: node.id,
        symbolType: node.symbolType,
        canonicalType
      });
    if (environment.svgVisualRegistry.get(canonicalType) === undefined)
      diagnostics.push({
        code: "missing-svg-visual",
        nodeId: node.id,
        symbolType: node.symbolType,
        canonicalType
      });
  }
  return Object.freeze({
    valid: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics)
  });
}

/** @deprecated Use {@link SymbolEnvironment}. */
export type DefaultSymbolEnvironment = SymbolEnvironment;

/** @deprecated Use {@link createIndustrialSymbolEnvironment}. */
export function createDefaultSymbolEnvironment(): SymbolEnvironment {
  return createIndustrialSymbolEnvironment();
}
