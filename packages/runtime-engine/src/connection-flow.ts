import type {
  ConnectionFlowAnimation,
  ConnectionFlowDirection,
  ConnectionFlowMode,
  ScadaConnection,
  ScadaDocument
} from "@web-scada/core";
import type {
  AnimationScheduler,
  AnimationTaskHandle,
  AnimationTaskId
} from "@web-scada/animation-engine";

export type ConnectionFlowQuality = "good" | "uncertain" | "bad" | "stale" | "offline";
export type ConnectionFlowAlarmState = "none" | "critical" | "warning" | "acknowledged" | "shelved";

export interface ConnectionFlowSample {
  readonly connectionId: string;
  readonly animationId: string;
  readonly mode: ConnectionFlowMode;
  readonly phase: number;
  readonly progress: number;
  readonly direction: ConnectionFlowDirection;
  readonly speed: number;
  readonly intensity: number;
  readonly opacity: number;
  readonly color?: string;
  readonly dashLength: number;
  readonly gapLength: number;
  readonly lineWidth?: number;
  readonly markerCount: number;
  readonly markerSpacing: number;
  readonly markerSize: number;
  readonly orientMarkers: boolean;
  readonly quality: ConnectionFlowQuality;
  readonly alarm: ConnectionFlowAlarmState;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly revision: number;
}

export type ConnectionFlowDiagnosticCode =
  | "CONNECTION_FLOW_INVALID_METADATA"
  | "CONNECTION_FLOW_INVALID_BINDING"
  | "CONNECTION_FLOW_UNSUPPORTED_PRIMITIVE"
  | "CONNECTION_FLOW_UNSUPPORTED_MODE"
  | "CONNECTION_FLOW_TARGET_NOT_FOUND"
  | "CONNECTION_FLOW_RUNTIME_FAILED";

export interface ConnectionFlowDiagnostic {
  readonly code: ConnectionFlowDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly connectionId?: string;
}

export interface ConnectionFlowRuntimeUpdate {
  readonly enabled?: boolean;
  readonly speed?: number;
  readonly direction?: ConnectionFlowDirection;
  readonly quality?: ConnectionFlowQuality;
  readonly alarm?: ConnectionFlowAlarmState;
  readonly flowPercentage?: number;
  readonly visible?: boolean;
}

export interface ConnectionFlowModeRegistration {
  readonly id: ConnectionFlowMode;
  readonly validate?: (configuration: Readonly<ConnectionFlowAnimation>) => boolean;
}

export interface ConnectionFlowMarkerRegistration {
  readonly id: string;
  readonly kind: "shape" | "symbol-reference";
}
export interface ConnectionFlowRendererRegistration {
  readonly id: string;
  readonly apply: (sample: Readonly<ConnectionFlowSample>) => void;
}
export interface ConnectionFlowDiagnosticRegistration {
  readonly id: string;
  readonly describe: (message: string) => string;
}
export interface ConnectionFlowPreviewRegistration {
  readonly id: string;
  readonly create: (connectionId: string) => unknown;
}

/** Bounded, renderer-neutral extension point. It deliberately exposes no SVG internals. */
export class ConnectionFlowPluginRegistry {
  readonly #modes = new Map<string, ConnectionFlowModeRegistration>();
  readonly #markers = new Map<string, ConnectionFlowMarkerRegistration>();
  readonly #renderers = new Map<string, ConnectionFlowRendererRegistration>();
  readonly #diagnostics = new Map<string, ConnectionFlowDiagnosticRegistration>();
  readonly #previews = new Map<string, ConnectionFlowPreviewRegistration>();

  public constructor() {
    for (const id of [
      "none",
      "dash",
      "marker",
      "arrow",
      "highlight",
      "gradient",
      "particle-foundation"
    ] as const)
      this.#modes.set(id, Object.freeze({ id }));
  }

  public registerMode(registration: Readonly<ConnectionFlowModeRegistration>): void {
    if (!safeId(registration.id) || this.#modes.has(registration.id))
      throw new TypeError("Flow mode registration is invalid or duplicated.");
    this.#modes.set(registration.id, Object.freeze({ ...registration }));
  }

  public hasMode(id: string): boolean {
    return this.#modes.has(id);
  }
  public registerMarker(registration: Readonly<ConnectionFlowMarkerRegistration>): void {
    this.#register(this.#markers, registration);
  }
  public registerRenderer(registration: Readonly<ConnectionFlowRendererRegistration>): void {
    this.#register(this.#renderers, registration);
  }
  public registerDiagnostic(registration: Readonly<ConnectionFlowDiagnosticRegistration>): void {
    this.#register(this.#diagnostics, registration);
  }
  public registerPreviewProvider(registration: Readonly<ConnectionFlowPreviewRegistration>): void {
    this.#register(this.#previews, registration);
  }
  public get rendererCount(): number {
    return this.#renderers.size;
  }
  public get markerCount(): number {
    return this.#markers.size;
  }
  public get previewProviderCount(): number {
    return this.#previews.size;
  }
  #register<T extends { readonly id: string }>(
    target: Map<string, T>,
    registration: Readonly<T>
  ): void {
    if (!safeId(registration.id) || target.has(registration.id))
      throw new TypeError("Connection flow plugin registration is invalid or duplicated.");
    target.set(registration.id, Object.freeze({ ...registration }));
  }
}

interface RuntimeState {
  enabled: boolean;
  speed: number;
  direction: ConnectionFlowDirection;
  quality: ConnectionFlowQuality;
  alarm: ConnectionFlowAlarmState;
  flowPercentage?: number;
  visible: boolean;
}

export class ConnectionFlowController {
  readonly #state: RuntimeState;
  #handle: AnimationTaskHandle | undefined;
  #phase = 0;
  #revision = 0;
  #disposed = false;

  public constructor(
    public readonly connection: Readonly<ScadaConnection>,
    private readonly configuration: Readonly<ConnectionFlowAnimation>,
    private readonly scheduler: AnimationScheduler,
    private readonly emit: (sample: Readonly<ConnectionFlowSample>) => void,
    private readonly report: (diagnostic: Readonly<ConnectionFlowDiagnostic>) => void
  ) {
    this.#state = {
      enabled: configuration.enabled ?? true,
      speed: configuration.speed ?? 1,
      direction: configuration.direction ?? "forward",
      quality: "good",
      alarm: "none",
      visible: connection.visible
    };
  }

  public mount(): void {
    if (this.#disposed || this.#handle !== undefined || !this.#state.enabled) return;
    try {
      this.#handle = this.scheduler.register({
        id: `connection-flow:${this.connection.id}` as AnimationTaskId,
        motionBehavior:
          this.configuration.reducedMotion === "allow"
            ? "allow"
            : this.configuration.reducedMotion === "static"
              ? "static-final-state"
              : "disable",
        update: (context) => {
          if (!this.#state.visible || !this.#state.enabled) return { status: "sleep" };
          const qualityFactor =
            this.#state.quality === "good" ? 1 : this.#state.quality === "uncertain" ? 0.5 : 0;
          if (!context.reducedMotion && qualityFactor > 0) {
            const sign = this.#state.direction === "forward" ? 1 : -1;
            this.#phase = wrap(
              this.#phase + (context.deltaTime / 1000) * this.#state.speed * qualityFactor * sign
            );
          }
          this.#emitSample(context.reducedMotion);
          return {
            invalidations: [
              { targetType: "connection", targetId: this.connection.id, reason: "flow-sample" }
            ]
          };
        }
      });
    } catch (error) {
      this.report({
        code: "CONNECTION_FLOW_RUNTIME_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : "Connection flow registration failed.",
        connectionId: this.connection.id
      });
    }
  }

  public update(update: Readonly<ConnectionFlowRuntimeUpdate>): void {
    if (this.#disposed) return;
    if (update.enabled !== undefined) this.#state.enabled = update.enabled;
    if (update.speed !== undefined) this.#state.speed = update.speed;
    if (update.direction !== undefined) this.#state.direction = update.direction;
    if (update.quality !== undefined) this.#state.quality = update.quality;
    if (update.alarm !== undefined) this.#state.alarm = update.alarm;
    if (update.flowPercentage !== undefined) {
      this.#state.flowPercentage = update.flowPercentage;
      this.#phase = wrap(update.flowPercentage / 100);
    }
    if (update.visible !== undefined) this.#state.visible = update.visible;
    if (this.#state.enabled) {
      this.mount();
      this.#handle?.resume();
      this.scheduler.requestFrame();
    } else this.#handle?.pause();
  }

  public pause(): void {
    this.#handle?.pause();
  }
  public resume(): void {
    if (this.#state.enabled) this.#handle?.resume();
  }
  public stop(): void {
    this.#handle?.dispose();
    this.#handle = undefined;
    this.#phase = 0;
    this.#emitSample(false);
  }
  public seek(progress: number): void {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new RangeError("Flow progress must be between zero and one.");
    this.#phase = progress;
    this.#emitSample(false);
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
  }

  #emitSample(reducedMotion: boolean): void {
    this.#revision += 1;
    const markerCount = clampInteger(this.configuration.markerCount ?? 1, 0, 64);
    this.emit(
      Object.freeze({
        connectionId: this.connection.id,
        animationId: this.configuration.id,
        mode: this.configuration.mode,
        phase: this.#phase,
        progress: this.#phase,
        direction: this.#state.direction,
        speed: this.#state.speed,
        intensity: clamp(this.configuration.intensity ?? 1, 0, 1),
        opacity: clamp(this.configuration.opacity ?? 1, 0, 1),
        ...(this.configuration.color === undefined ? {} : { color: this.configuration.color }),
        dashLength: this.configuration.dashLength ?? 8,
        gapLength: this.configuration.gapLength ?? 6,
        ...(this.configuration.lineWidth === undefined
          ? {}
          : { lineWidth: this.configuration.lineWidth }),
        markerCount,
        markerSpacing: clamp(
          this.configuration.markerSpacing ?? (markerCount === 0 ? 0 : 1 / markerCount),
          0,
          1
        ),
        markerSize: clamp(this.configuration.markerSize ?? 4, 0.5, 64),
        orientMarkers: this.configuration.orientMarkers ?? true,
        quality: this.#state.quality,
        alarm: this.#state.alarm,
        visible: this.#state.visible,
        reducedMotion,
        revision: this.#revision
      })
    );
  }
}

export interface RuntimeConnectionFlowManagerOptions {
  readonly scheduler: AnimationScheduler;
  readonly onSample: (sample: Readonly<ConnectionFlowSample>) => void;
  readonly onDiagnostic?: (diagnostic: Readonly<ConnectionFlowDiagnostic>) => void;
  readonly plugins?: ConnectionFlowPluginRegistry;
  readonly diagnosticCapacity?: number;
}

export class RuntimeConnectionFlowManager {
  readonly #controllers = new Map<string, ConnectionFlowController>();
  readonly #diagnostics: ConnectionFlowDiagnostic[] = [];
  readonly #plugins: ConnectionFlowPluginRegistry;
  #disposed = false;

  public constructor(private readonly options: RuntimeConnectionFlowManagerOptions) {
    this.#plugins = options.plugins ?? new ConnectionFlowPluginRegistry();
  }

  public loadDocument(document: Readonly<ScadaDocument>): void {
    this.#assertUsable();
    const next = new Set(document.connections.map(({ id }) => id));
    for (const [id, controller] of this.#controllers)
      if (!next.has(id)) {
        controller.dispose();
        this.#controllers.delete(id);
      }
    for (const connection of document.connections) {
      if (this.#controllers.has(connection.id) || connection.flowAnimation === undefined) continue;
      const metadata = connection.flowAnimation;
      const invalid = validateMetadata(metadata, this.#plugins);
      if (invalid !== undefined) {
        this.#report({
          code: invalid.code,
          severity: "warning",
          message: invalid.message,
          connectionId: connection.id
        });
        continue;
      }
      const controller = new ConnectionFlowController(
        connection,
        metadata,
        this.options.scheduler,
        this.options.onSample,
        (diagnostic) => {
          this.#report(diagnostic);
        }
      );
      this.#controllers.set(connection.id, controller);
      controller.mount();
    }
  }

  public controller(connectionId: string): ConnectionFlowController | undefined {
    return this.#controllers.get(connectionId);
  }
  public update(connectionId: string, update: Readonly<ConnectionFlowRuntimeUpdate>): void {
    const controller = this.#controllers.get(connectionId);
    if (controller === undefined) {
      this.#report({
        code: "CONNECTION_FLOW_TARGET_NOT_FOUND",
        severity: "warning",
        message: "Connection flow target was not found.",
        connectionId
      });
      return;
    }
    if (!validUpdate(update)) {
      this.#report({
        code: "CONNECTION_FLOW_INVALID_BINDING",
        severity: "warning",
        message: "Connection flow runtime update is invalid.",
        connectionId
      });
      return;
    }
    controller.update(update);
  }
  public pause(): void {
    for (const controller of this.#controllers.values()) controller.pause();
  }
  public resume(): void {
    for (const controller of this.#controllers.values()) controller.resume();
  }
  public stop(): void {
    for (const controller of this.#controllers.values()) controller.stop();
  }
  public dispose(): void {
    if (this.#disposed) return;
    for (const controller of this.#controllers.values()) controller.dispose();
    this.#controllers.clear();
    this.#disposed = true;
  }
  public get diagnostics(): readonly Readonly<ConnectionFlowDiagnostic>[] {
    return Object.freeze([...this.#diagnostics]);
  }
  public get size(): number {
    return this.#controllers.size;
  }

  #report(diagnostic: Readonly<ConnectionFlowDiagnostic>): void {
    const capacity = this.options.diagnosticCapacity ?? 100;
    if (this.#diagnostics.length < capacity)
      this.#diagnostics.push(Object.freeze({ ...diagnostic }));
    this.options.onDiagnostic?.(diagnostic);
  }
  #assertUsable(): void {
    if (this.#disposed) throw new Error("Connection flow manager is disposed.");
  }
}

function validateMetadata(
  metadata: Readonly<ConnectionFlowAnimation>,
  plugins: ConnectionFlowPluginRegistry
): ConnectionFlowDiagnostic | undefined {
  if (!safeId(metadata.id) || !plugins.hasMode(metadata.mode))
    return {
      code: "CONNECTION_FLOW_UNSUPPORTED_MODE",
      severity: "warning",
      message: "Connection flow ID or mode is invalid."
    };
  if (
    !["scalar", "translation", "opacity", "color", "transform", "keyframe"].includes(
      metadata.primitive
    )
  )
    return {
      code: "CONNECTION_FLOW_UNSUPPORTED_PRIMITIVE",
      severity: "warning",
      message: "Connection flow primitive is unsupported."
    };
  const values = [
    metadata.speed,
    metadata.opacity,
    metadata.intensity,
    metadata.dashLength,
    metadata.gapLength,
    metadata.lineWidth,
    metadata.markerCount,
    metadata.markerSpacing,
    metadata.markerSize
  ];
  if (values.some((value) => value !== undefined && !Number.isFinite(value)))
    return {
      code: "CONNECTION_FLOW_INVALID_METADATA",
      severity: "warning",
      message: "Connection flow numeric metadata must be finite."
    };
  return undefined;
}
function validUpdate(update: Readonly<ConnectionFlowRuntimeUpdate>): boolean {
  return (
    (update.speed === undefined || (Number.isFinite(update.speed) && update.speed >= 0)) &&
    (update.flowPercentage === undefined ||
      (Number.isFinite(update.flowPercentage) &&
        update.flowPercentage >= 0 &&
        update.flowPercentage <= 100))
  );
}
function safeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.round(clamp(value, minimum, maximum));
}
