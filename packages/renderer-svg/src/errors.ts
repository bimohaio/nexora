export type RendererErrorCode =
  | "RENDERER_NOT_MOUNTED"
  | "RENDERER_ALREADY_MOUNTED"
  | "RENDERER_DISPOSED"
  | "RENDER_TARGET_INVALID"
  | "RENDER_OPTIONS_INVALID"
  | "SYMBOL_RENDERER_NOT_FOUND"
  | "NODE_ELEMENT_NOT_FOUND"
  | "CONNECTION_ELEMENT_NOT_FOUND"
  | "PORT_RESOLUTION_FAILED"
  | "SVG_ELEMENT_CREATION_FAILED"
  | "RENDER_DOCUMENT_FAILED";

export class RendererError extends Error {
  public constructor(
    public readonly code: RendererErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RendererError";
  }
}
