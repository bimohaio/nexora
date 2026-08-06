import type { ScadaDocument } from "@web-scada/core";

export interface ConnectionFlowPreviewRuntime {
  loadDocument(document: Readonly<ScadaDocument>): void;
  update(
    connectionId: string,
    update: Readonly<{ enabled?: boolean; speed?: number; direction?: "forward" | "reverse" }>
  ): void;
  pause(): void;
  resume(): void;
  controller(
    connectionId: string
  ): { stop(): void; mount(): void; seek(progress: number): void } | undefined;
  dispose(): void;
}

export interface DesignerConnectionFlowPreviewOptions {
  readonly document: Readonly<ScadaDocument>;
  readonly runtime: ConnectionFlowPreviewRuntime;
}

/** Isolated preview facade. It retains the document by readonly reference and never writes to it. */
export class DesignerConnectionFlowPreviewController {
  readonly #manager: ConnectionFlowPreviewRuntime;
  #document: Readonly<ScadaDocument>;
  #disposed = false;

  public constructor(options: DesignerConnectionFlowPreviewOptions) {
    this.#document = options.document;
    this.#manager = options.runtime;
    this.#manager.loadDocument(options.document);
  }
  public updateDocument(document: Readonly<ScadaDocument>): void {
    this.#assert();
    this.#document = document;
    this.#manager.loadDocument(document);
  }
  public play(connectionId: string): void {
    this.#assert();
    this.#manager.update(connectionId, { enabled: true });
  }
  public pause(): void {
    this.#assert();
    this.#manager.pause();
  }
  public resume(): void {
    this.#assert();
    this.#manager.resume();
  }
  public restart(connectionId: string): void {
    this.#assert();
    const controller = this.#manager.controller(connectionId);
    controller?.stop();
    controller?.mount();
  }
  public seek(connectionId: string, progress: number): void {
    this.#assert();
    this.#manager.controller(connectionId)?.seek(progress);
  }
  public setSpeedOverride(connectionId: string, speed: number): void {
    this.#assert();
    this.#manager.update(connectionId, { speed });
  }
  public setDirection(connectionId: string, direction: "forward" | "reverse"): void {
    this.#assert();
    this.#manager.update(connectionId, { direction });
  }
  public propertyInspectorValue(
    connectionId: string
  ): Readonly<ScadaDocument["connections"][number]["flowAnimation"]> | undefined {
    return this.#document.connections.find(({ id }) => id === connectionId)?.flowAnimation;
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#manager.dispose();
    this.#disposed = true;
  }
  #assert(): void {
    if (this.#disposed) throw new Error("Connection flow preview is disposed.");
  }
}
