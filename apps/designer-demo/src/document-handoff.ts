import { parseDocumentJson, type ScadaDocument } from "@web-scada/core";
import { validateDocumentSymbolEnvironment, type SymbolEnvironment } from "@web-scada/renderer-svg";

export const DESIGNER_DOCUMENT_FRAGMENT_KEY = "nexora-document";

export interface DesignerDocumentBootstrap {
  readonly document: ScadaDocument;
  readonly openedFromRuntime: boolean;
  readonly sessionId?: string;
  readonly runtimeOrigin?: string;
  readonly baseRevision?: number;
}

export function resolveDesignerDocument(
  hash: string,
  fallback: ScadaDocument,
  environment: SymbolEnvironment
): DesignerDocumentBootstrap {
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const documentJson = fragment.get(DESIGNER_DOCUMENT_FRAGMENT_KEY);
  if (documentJson === null) return { document: fallback, openedFromRuntime: false };
  const sessionId = fragment.get("session");
  const runtimeOrigin = fragment.get("runtimeOrigin");
  const baseRevisionText = fragment.get("baseRevision");
  const baseRevision = baseRevisionText === null ? undefined : Number(baseRevisionText);
  if (
    sessionId === null ||
    sessionId === "" ||
    runtimeOrigin === null ||
    !URL.canParse(runtimeOrigin) ||
    baseRevision === undefined ||
    !Number.isInteger(baseRevision) ||
    baseRevision < 1
  )
    throw new Error("Unable to open Runtime document: invalid editing session.");

  const parsed = parseDocumentJson(documentJson, { symbolRegistry: environment.symbolRegistry });
  if (!parsed.success)
    throw new Error(
      `Unable to open Runtime document: ${parsed.issues.map(({ message }) => message).join("; ")}`
    );
  const symbolValidation = validateDocumentSymbolEnvironment(parsed.document, environment);
  if (!symbolValidation.valid)
    throw new Error(
      `Unable to open Runtime document: ${symbolValidation.diagnostics
        .map(({ code, nodeId, symbolType }) => `${code}:${nodeId}:${symbolType}`)
        .join("; ")}`
    );
  return {
    document: parsed.document,
    openedFromRuntime: true,
    sessionId,
    runtimeOrigin: new URL(runtimeOrigin).origin,
    baseRevision
  };
}
