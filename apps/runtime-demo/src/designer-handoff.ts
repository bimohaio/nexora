export const DESIGNER_DOCUMENT_FRAGMENT_KEY = "nexora-document";
export const PUBLISHED_DOCUMENT_STORAGE_KEY = "nexora.runtime.published-document";
export const PUBLISHED_REVISION_STORAGE_KEY = "nexora.runtime.published-revision";

export interface DesignerHandoffOptions {
  readonly sessionId: string;
  readonly runtimeOrigin: string;
  readonly baseRevision: number;
}

export function createDesignerHandoffUrl(
  designerUrl: string | URL,
  documentJson: string,
  options: DesignerHandoffOptions
): string {
  const target = new URL(designerUrl);
  target.hash = new URLSearchParams({
    [DESIGNER_DOCUMENT_FRAGMENT_KEY]: documentJson,
    source: "runtime",
    session: options.sessionId,
    runtimeOrigin: options.runtimeOrigin,
    baseRevision: String(options.baseRevision)
  }).toString();
  return target.toString();
}

export interface PublishDocumentMessage {
  readonly type: "nexora:publish-document";
  readonly sessionId: string;
  readonly documentId: string;
  readonly baseRevision: number;
  readonly documentJson: string;
}

export function isPublishDocumentMessage(value: unknown): value is PublishDocumentMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PublishDocumentMessage>;
  return (
    candidate.type === "nexora:publish-document" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.documentId === "string" &&
    typeof candidate.baseRevision === "number" &&
    Number.isInteger(candidate.baseRevision) &&
    typeof candidate.documentJson === "string"
  );
}

export function resolveDesignerUrl(currentUrl: URL, configuredUrl?: string): URL {
  if (configuredUrl !== undefined && configuredUrl.trim() !== "")
    return new URL(configuredUrl, currentUrl);
  if (currentUrl.hostname === "127.0.0.1" || currentUrl.hostname === "localhost") {
    const developmentUrl = new URL(currentUrl);
    developmentUrl.port = "4175";
    developmentUrl.pathname = "/";
    developmentUrl.search = "";
    developmentUrl.hash = "";
    return developmentUrl;
  }
  return new URL("/designer/", currentUrl.origin);
}
