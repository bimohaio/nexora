import type { TransformValue, Vector2Value } from "@web-scada/animation-engine";
import type { SvgRenderer } from "./contracts.js";

export interface RendererSymbolAnimationTarget {
  readonly part: string;
  readonly property: string;
}

export interface RendererSymbolAnimationSample {
  readonly entityId: string;
  readonly slotId: string;
  readonly target: RendererSymbolAnimationTarget;
  readonly value: unknown;
}

export interface SvgAnimationDiagnostic {
  readonly code: "ANIMATION_TARGET_NOT_FOUND" | "ANIMATION_RENDERER_FAILED";
  readonly severity: "error";
  readonly message: string;
  readonly entityId: string;
  readonly slotId: string;
  readonly timestamp: number;
}

interface TransformState {
  base: string;
  lastApplied?: string;
}

export class RenderPartResolver {
  readonly #cache = new Map<string, Element>();

  public constructor(private readonly renderer: Pick<SvgRenderer, "getElementForNode">) {}

  public resolve(entityId: string, part: string): Element | undefined {
    const key = `${entityId}\u0000${part}`;
    const cached = this.#cache.get(key);
    if (cached?.isConnected === true) return cached;
    const node = this.renderer.getElementForNode(entityId);
    if (node === undefined) return undefined;
    const root = node.querySelector<SVGGElement>("[data-scada-symbol]") ?? node;
    const element =
      part === "root"
        ? root
        : Array.from(root.querySelectorAll<SVGElement>("[data-scada-part]")).find(
            ({ dataset }) => dataset.scadaPart === part
          );
    if (element !== undefined) this.#cache.set(key, element);
    return element;
  }

  public invalidate(entityId?: string): void {
    if (entityId === undefined) this.#cache.clear();
    else
      for (const key of this.#cache.keys())
        if (key.startsWith(`${entityId}\u0000`)) this.#cache.delete(key);
  }

  public get size(): number {
    return this.#cache.size;
  }
}

export class TransformComposer {
  readonly #states = new WeakMap<Element, TransformState>();

  public apply(
    element: Element,
    value: number | Readonly<Vector2Value> | Partial<Readonly<TransformValue>>,
    property: string
  ): void {
    const current = element.getAttribute("transform") ?? "";
    let state = this.#states.get(element);
    if (state === undefined) {
      state = { base: current };
      this.#states.set(element, state);
    } else if (state.lastApplied !== undefined && current !== state.lastApplied)
      state.base = current;
    const addition = this.#serialize(value, property);
    const composed = [state.base, addition].filter((entry) => entry !== "").join(" ");
    element.setAttribute("transform", composed);
    state.lastApplied = composed;
  }

  public clear(element: Element): void {
    const state = this.#states.get(element);
    if (state === undefined) return;
    if (state.base === "") element.removeAttribute("transform");
    else element.setAttribute("transform", state.base);
    this.#states.delete(element);
  }

  #serialize(
    value: number | Readonly<Vector2Value> | Partial<Readonly<TransformValue>>,
    property: string
  ): string {
    if (property === "rotation" && typeof value === "number") return `rotate(${String(value)})`;
    if (property === "translation" && typeof value === "object" && "x" in value)
      return `translate(${String(value.x)} ${String(value.y)})`;
    if (property === "scale" && typeof value === "object" && "x" in value)
      return `scale(${String(value.x)} ${String(value.y)})`;
    if (property === "transform" && typeof value === "object" && "translation" in value) {
      const translation = value.translation ?? { x: 0, y: 0 };
      const scale = value.scale ?? { x: 1, y: 1 };
      return `translate(${String(translation.x)} ${String(translation.y)}) rotate(${String(value.rotationDeg ?? 0)}) scale(${String(scale.x)} ${String(scale.y)})`;
    }
    throw new Error(`Unsupported transform sample '${property}'.`);
  }
}

export class SampleApplier {
  readonly #baseAttributes = new WeakMap<Element, Map<string, string | null>>();

  public constructor(private readonly transforms = new TransformComposer()) {}

  public apply(element: Element, sample: RendererSymbolAnimationSample): void {
    const { property } = sample.target;
    if (["rotation", "translation", "scale", "transform"].includes(property)) {
      this.transforms.apply(
        element,
        sample.value as number | Readonly<Vector2Value> | Partial<Readonly<TransformValue>>,
        property
      );
      return;
    }
    if (property === "visible")
      this.#attribute(element, "visibility", sample.value ? "visible" : "hidden");
    else if (property === "opacity") this.#attribute(element, "opacity", String(sample.value));
    else if (property === "fill" || property === "stroke")
      this.#attribute(element, property, colorString(sample.value));
    else if (property === "flowOffset") {
      this.#attribute(element, "stroke-dasharray", "8 6");
      this.#attribute(element, "stroke-dashoffset", String(sample.value));
    } else if (property === "level" || property === "openness") {
      this.#attribute(element, `data-animation-${property}`, String(sample.value));
      if (element instanceof SVGElement)
        element.style.setProperty(`--scada-animation-${property}`, String(sample.value));
    } else throw new Error(`Unsupported animation sample property '${property}'.`);
  }

  public clear(element: Element): void {
    this.transforms.clear(element);
    const base = this.#baseAttributes.get(element);
    if (base === undefined) return;
    for (const [name, value] of base) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
      if (name.startsWith("data-animation-") && element instanceof SVGElement)
        element.style.removeProperty(`--scada-animation-${name.slice("data-animation-".length)}`);
    }
    this.#baseAttributes.delete(element);
  }

  #attribute(element: Element, name: string, value: string): void {
    let base = this.#baseAttributes.get(element);
    if (base === undefined) {
      base = new Map();
      this.#baseAttributes.set(element, base);
    }
    if (!base.has(name)) base.set(name, element.getAttribute(name));
    element.setAttribute(name, value);
  }
}

export interface SvgSymbolAnimationAdapterOptions {
  readonly onDiagnostic?: (diagnostic: SvgAnimationDiagnostic) => void;
}

export class SvgSymbolAnimationAdapter {
  readonly #resolver: RenderPartResolver;
  readonly #applier: SampleApplier;
  readonly #applied = new Map<string, Set<Element>>();
  #disposed = false;

  public constructor(
    renderer: Pick<SvgRenderer, "getElementForNode">,
    private readonly options: SvgSymbolAnimationAdapterOptions = {},
    resolver = new RenderPartResolver(renderer),
    applier = new SampleApplier()
  ) {
    this.#resolver = resolver;
    this.#applier = applier;
  }

  public applySamples(entityId: string, samples: readonly RendererSymbolAnimationSample[]): void {
    if (this.#disposed) return;
    const previous = this.#applied.get(entityId) ?? new Set<Element>();
    const next = new Set<Element>();
    for (const sample of samples) {
      const element = this.#resolver.resolve(entityId, sample.target.part);
      if (element === undefined) {
        this.#diagnose(
          "ANIMATION_TARGET_NOT_FOUND",
          "SVG animation part was not found.",
          entityId,
          sample.slotId
        );
        continue;
      }
      try {
        this.#applier.apply(element, sample);
        next.add(element);
      } catch (error) {
        this.#diagnose(
          "ANIMATION_RENDERER_FAILED",
          error instanceof Error ? error.message : "SVG animation update failed.",
          entityId,
          sample.slotId
        );
      }
    }
    for (const element of previous) if (!next.has(element)) this.#applier.clear(element);
    this.#applied.set(entityId, next);
  }

  public remove(entityId: string): void {
    for (const element of this.#applied.get(entityId) ?? []) this.#applier.clear(element);
    this.#applied.delete(entityId);
    this.#resolver.invalidate(entityId);
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const entityId of this.#applied.keys()) this.remove(entityId);
    this.#resolver.invalidate();
    this.#disposed = true;
  }

  public get cachedTargetCount(): number {
    return this.#resolver.size;
  }

  #diagnose(
    code: SvgAnimationDiagnostic["code"],
    message: string,
    entityId: string,
    slotId: string
  ): void {
    this.options.onDiagnostic?.({
      code,
      severity: "error",
      message,
      entityId,
      slotId,
      timestamp: Date.now()
    });
  }
}

function colorString(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value &&
    "a" in value
  ) {
    const color = value as {
      readonly r: unknown;
      readonly g: unknown;
      readonly b: unknown;
      readonly a: unknown;
    };
    return `rgba(${String(color.r)}, ${String(color.g)}, ${String(color.b)}, ${String(color.a)})`;
  }
  throw new Error("Animation color sample is invalid.");
}
