import type { ConnectionFlowDirection, ConnectionFlowMode } from "@web-scada/core";
import type { SvgRenderer } from "./contracts.js";

/** Structural renderer boundary; runtime samples are assignable without a package dependency. */
export interface RendererConnectionFlowSample {
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
  readonly quality: "good" | "uncertain" | "bad" | "stale" | "offline";
  readonly alarm: "none" | "critical" | "warning" | "acknowledged" | "shelved";
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly revision: number;
}

export type SvgConnectionFlowDiagnosticCode =
  | "CONNECTION_FLOW_TARGET_NOT_FOUND"
  | "CONNECTION_FLOW_INVALID_SAMPLE"
  | "CONNECTION_FLOW_INVALID_DASH_PATTERN"
  | "CONNECTION_FLOW_PATH_LENGTH_FAILED"
  | "CONNECTION_FLOW_MARKER_LIMIT_EXCEEDED"
  | "CONNECTION_FLOW_RENDER_APPLY_FAILED"
  | "CONNECTION_FLOW_RENDERER_DISPOSED";

export interface SvgConnectionFlowDiagnostic {
  readonly code: SvgConnectionFlowDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly connectionId?: string;
}

interface PathCacheEntry {
  readonly base: SVGPathElement;
  readonly overlay: SVGPathElement;
  readonly markerGroup: SVGGElement;
  readonly markers: SVGGraphicsElement[];
  geometrySignature: string;
  pathLength: number | undefined;
}

export interface SvgConnectionFlowAdapterOptions {
  readonly onDiagnostic?: (diagnostic: Readonly<SvgConnectionFlowDiagnostic>) => void;
  readonly markerLimit?: number;
  readonly diagnosticCapacity?: number;
}

/** SVG-only sample consumer. It never reads a clock and never schedules animation work. */
export class SvgConnectionFlowAdapter {
  readonly #cache = new Map<string, PathCacheEntry>();
  readonly #pending = new Map<string, Readonly<RendererConnectionFlowSample>>();
  readonly #diagnostics: SvgConnectionFlowDiagnostic[] = [];
  #disposed = false;

  public constructor(
    private readonly renderer: Pick<SvgRenderer, "getElementForConnection">,
    private readonly options: SvgConnectionFlowAdapterOptions = {}
  ) {}

  /** Deduplicates samples; call commit once from the scheduler invalidation sink. */
  public enqueue(sample: Readonly<RendererConnectionFlowSample>): void {
    if (this.#disposed) return;
    this.#pending.set(sample.connectionId, sample);
  }

  public commit(): void {
    if (this.#disposed) return;
    const batch = [...this.#pending].sort(([left], [right]) => left.localeCompare(right));
    this.#pending.clear();
    for (const [, sample] of batch)
      try {
        this.#apply(sample);
      } catch (error) {
        this.#report({
          code: "CONNECTION_FLOW_RENDER_APPLY_FAILED",
          severity: "error",
          message: error instanceof Error ? error.message : "Connection flow SVG update failed.",
          connectionId: sample.connectionId
        });
      }
  }

  public applySample(sample: Readonly<RendererConnectionFlowSample>): void {
    this.enqueue(sample);
    this.commit();
  }

  public invalidateGeometry(connectionId: string): void {
    const entry = this.#cache.get(connectionId);
    if (entry === undefined) return;
    entry.geometrySignature = "";
    entry.pathLength = undefined;
  }

  public remove(connectionId: string): void {
    this.#pending.delete(connectionId);
    const entry = this.#cache.get(connectionId);
    entry?.overlay.remove();
    entry?.markerGroup.remove();
    this.#cache.delete(connectionId);
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const connectionId of [...this.#cache.keys()]) this.remove(connectionId);
    this.#pending.clear();
    this.#disposed = true;
  }

  public get cacheSize(): number {
    return this.#cache.size;
  }
  public get pendingCount(): number {
    return this.#pending.size;
  }
  public get diagnostics(): readonly Readonly<SvgConnectionFlowDiagnostic>[] {
    return Object.freeze([...this.#diagnostics]);
  }
  public debugSnapshot(): readonly Readonly<{
    connectionId: string;
    geometrySignature: string;
    pathLength?: number;
    markerCount: number;
  }>[] {
    return Object.freeze(
      [...this.#cache].map(([connectionId, entry]) =>
        Object.freeze({
          connectionId,
          geometrySignature: entry.geometrySignature,
          ...(entry.pathLength === undefined ? {} : { pathLength: entry.pathLength }),
          markerCount: entry.markers.length
        })
      )
    );
  }

  #apply(sample: Readonly<RendererConnectionFlowSample>): void {
    if (!validSample(sample)) {
      this.#report({
        code: "CONNECTION_FLOW_INVALID_SAMPLE",
        severity: "warning",
        message: "Connection flow sample is invalid.",
        connectionId: sample.connectionId
      });
      return;
    }
    const base = this.renderer.getElementForConnection(sample.connectionId);
    if (base?.isConnected !== true) {
      this.#report({
        code: "CONNECTION_FLOW_TARGET_NOT_FOUND",
        severity: "warning",
        message: "Visible connection path was not found.",
        connectionId: sample.connectionId
      });
      this.remove(sample.connectionId);
      return;
    }
    const entry = this.#entry(sample.connectionId, base);
    this.#syncGeometry(entry);
    if (!sample.visible || sample.mode === "none") {
      entry.overlay.style.display = "none";
      entry.markerGroup.style.display = "none";
      return;
    }
    entry.overlay.style.display = "";
    entry.overlay.setAttribute(
      "stroke",
      sample.color ?? base.getAttribute("stroke") ?? "currentColor"
    );
    entry.overlay.setAttribute("opacity", String(qualityOpacity(sample)));
    entry.overlay.setAttribute(
      "stroke-width",
      String(sample.lineWidth ?? Number(base.getAttribute("stroke-width") ?? 3))
    );
    const moving =
      !sample.reducedMotion &&
      sample.quality !== "bad" &&
      sample.quality !== "offline" &&
      sample.quality !== "stale";
    if (sample.mode === "dash") this.#dash(entry, sample, moving);
    else if (["marker", "arrow", "particle-foundation"].includes(sample.mode))
      this.#markers(entry, sample, moving);
    else if (["highlight", "gradient"].includes(sample.mode)) {
      entry.overlay.removeAttribute("stroke-dasharray");
      entry.overlay.removeAttribute("stroke-dashoffset");
      entry.markerGroup.style.display = "none";
    } else {
      entry.overlay.style.display = "none";
      entry.markerGroup.style.display = "none";
    }
  }

  #entry(connectionId: string, base: SVGPathElement): PathCacheEntry {
    const cached = this.#cache.get(connectionId);
    if (cached?.base === base && cached.overlay.isConnected) return cached;
    if (cached !== undefined) this.remove(connectionId);
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "path");
    overlay.dataset.scadaConnectionFlow = connectionId;
    overlay.setAttribute("fill", "none");
    overlay.setAttribute("pointer-events", "none");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("vector-effect", "non-scaling-stroke");
    const markerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    markerGroup.dataset.scadaConnectionFlowMarkers = connectionId;
    markerGroup.setAttribute("pointer-events", "none");
    markerGroup.setAttribute("aria-hidden", "true");
    base.after(overlay, markerGroup);
    const entry: PathCacheEntry = {
      base,
      overlay,
      markerGroup,
      markers: [],
      geometrySignature: "",
      pathLength: undefined
    };
    this.#cache.set(connectionId, entry);
    return entry;
  }

  #syncGeometry(entry: PathCacheEntry): void {
    const signature = entry.base.getAttribute("d") ?? "";
    if (signature === entry.geometrySignature) return;
    entry.geometrySignature = signature;
    entry.pathLength = undefined;
    entry.overlay.setAttribute("d", signature);
  }

  #dash(
    entry: PathCacheEntry,
    sample: Readonly<RendererConnectionFlowSample>,
    moving: boolean
  ): void {
    const pattern = sample.dashLength + sample.gapLength;
    if (sample.dashLength <= 0 || sample.gapLength < 0 || pattern <= 0) {
      entry.overlay.style.display = "none";
      this.#report({
        code: "CONNECTION_FLOW_INVALID_DASH_PATTERN",
        severity: "warning",
        message: "Dash pattern must have a positive dash and effective length.",
        connectionId: sample.connectionId
      });
      return;
    }
    entry.markerGroup.style.display = "none";
    entry.overlay.setAttribute(
      "stroke-dasharray",
      `${String(sample.dashLength)} ${String(sample.gapLength)}`
    );
    const phase = moving ? sample.phase : 0;
    const sign = sample.direction === "forward" ? -1 : 1;
    entry.overlay.setAttribute(
      "stroke-dashoffset",
      String(phase === 0 ? 0 : sign * phase * pattern)
    );
  }

  #markers(
    entry: PathCacheEntry,
    sample: Readonly<RendererConnectionFlowSample>,
    moving: boolean
  ): void {
    entry.overlay.removeAttribute("stroke-dasharray");
    entry.overlay.removeAttribute("stroke-dashoffset");
    const limit = this.options.markerLimit ?? 64;
    const requested = Math.min(sample.markerCount, limit);
    if (sample.markerCount > limit)
      this.#report({
        code: "CONNECTION_FLOW_MARKER_LIMIT_EXCEEDED",
        severity: "warning",
        message: "Marker count was clamped to the renderer limit.",
        connectionId: sample.connectionId
      });
    while (entry.markers.length < requested) {
      const marker =
        sample.mode === "arrow"
          ? document.createElementNS("http://www.w3.org/2000/svg", "path")
          : document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.dataset.scadaFlowMarker = String(entry.markers.length);
      marker.setAttribute(
        "fill",
        sample.color ?? entry.overlay.getAttribute("stroke") ?? "currentColor"
      );
      if (sample.mode === "arrow") marker.setAttribute("d", "M -4 -3 L 4 0 L -4 3 z");
      else marker.setAttribute("r", String(sample.markerSize));
      entry.markerGroup.append(marker);
      entry.markers.push(marker);
    }
    entry.markerGroup.style.display = requested === 0 ? "none" : "";
    const length = this.#pathLength(entry, sample.connectionId);
    for (let index = 0; index < entry.markers.length; index += 1) {
      const marker = entry.markers[index];
      if (marker === undefined) continue;
      if (index >= requested || length <= 0) {
        marker.style.display = "none";
        continue;
      }
      marker.style.display = "";
      const basePhase = moving ? sample.phase : 0.5;
      const directionPhase = sample.direction === "forward" ? basePhase : 1 - basePhase;
      const position = wrap(directionPhase + index * sample.markerSpacing);
      const point = this.#point(entry, position * length);
      const epsilon = Math.min(1, length / 100);
      const near = this.#point(entry, Math.min(length, position * length + epsilon));
      let angle = sample.orientMarkers
        ? (Math.atan2(near.y - point.y, near.x - point.x) * 180) / Math.PI
        : 0;
      if (sample.direction === "reverse") angle += 180;
      if (!Number.isFinite(angle)) angle = 0;
      marker.setAttribute(
        "transform",
        `translate(${String(point.x)} ${String(point.y)}) rotate(${String(angle)})`
      );
    }
  }

  #pathLength(entry: PathCacheEntry, connectionId: string): number {
    if (entry.pathLength !== undefined) return entry.pathLength;
    try {
      const fallbackLength = linePathLength(entry.geometrySignature);
      const measured =
        typeof entry.overlay.getTotalLength === "function"
          ? entry.overlay.getTotalLength()
          : fallbackLength;
      const length = measured === 0 && fallbackLength > 0 ? fallbackLength : measured;
      entry.pathLength = Number.isFinite(length) && length >= 0 ? length : 0;
    } catch {
      entry.pathLength = 0;
      this.#report({
        code: "CONNECTION_FLOW_PATH_LENGTH_FAILED",
        severity: "warning",
        message: "Connection path length could not be measured.",
        connectionId
      });
    }
    return entry.pathLength;
  }

  #point(entry: PathCacheEntry, distance: number): DOMPoint {
    if (typeof entry.overlay.getPointAtLength === "function")
      return entry.overlay.getPointAtLength(distance);
    const point = linePathPoint(entry.geometrySignature, distance);
    return new DOMPoint(point.x, point.y);
  }

  #report(diagnostic: Readonly<SvgConnectionFlowDiagnostic>): void {
    const capacity = this.options.diagnosticCapacity ?? 100;
    if (this.#diagnostics.length < capacity)
      this.#diagnostics.push(Object.freeze({ ...diagnostic }));
    this.options.onDiagnostic?.(diagnostic);
  }
}

function validSample(sample: Readonly<RendererConnectionFlowSample>): boolean {
  return (
    sample.connectionId.trim() !== "" &&
    [
      sample.phase,
      sample.opacity,
      sample.intensity,
      sample.dashLength,
      sample.gapLength,
      sample.markerCount,
      sample.markerSpacing,
      sample.markerSize
    ].every(Number.isFinite) &&
    sample.phase >= 0 &&
    sample.phase < 1
  );
}
function qualityOpacity(sample: Readonly<RendererConnectionFlowSample>): number {
  const factor = sample.quality === "good" ? 1 : sample.quality === "uncertain" ? 0.6 : 0.35;
  return Math.min(1, Math.max(0, sample.opacity * sample.intensity * factor));
}
function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}
function pathPoints(data: string): readonly { x: number; y: number }[] {
  const values = data.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < values.length; index += 2)
    points.push({ x: values[index] ?? 0, y: values[index + 1] ?? 0 });
  return points;
}
function linePathLength(data: string): number {
  const points = pathPoints(data);
  let length = 0;
  for (let index = 1; index < points.length; index += 1)
    length += Math.hypot(
      (points[index]?.x ?? 0) - (points[index - 1]?.x ?? 0),
      (points[index]?.y ?? 0) - (points[index - 1]?.y ?? 0)
    );
  return length;
}
function linePathPoint(data: string, distance: number): { x: number; y: number } {
  const points = pathPoints(data);
  if (points.length === 0) return { x: 0, y: 0 };
  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1] ?? { x: 0, y: 0 };
    const end = points[index] ?? start;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > 0 && remaining <= length) {
      const ratio = remaining / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}
