import type { JsonValue } from "@web-scada/core";
import type { SymbolState } from "@web-scada/symbols";
import type {
  SvgSymbolRenderContext,
  SvgSymbolRenderer,
  SvgSymbolRendererRegistry
} from "./contracts.js";
import { createSvgElement, synchronizeSvgElement } from "./dom.js";
import { registerIndustrialSvgSymbolRenderers } from "./industrial-symbol-renderers.js";

function stringProperty(context: SvgSymbolRenderContext, key: string, fallback: string): string {
  const value = context.node.properties[key];
  return typeof value === "string" ? value : fallback;
}

function numberProperty(context: SvgSymbolRenderContext, key: string, fallback: number): number {
  const value = context.node.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanProperty(context: SvgSymbolRenderContext, key: string, fallback: boolean): boolean {
  const value = context.node.properties[key];
  return typeof value === "boolean" ? value : fallback;
}

export function runtimeStateClass(state: SymbolState): string {
  return `scada-state-${state}`;
}

function stateColor(state: SymbolState, fallback: string): string {
  const colors: Readonly<Record<SymbolState, string>> = {
    normal: fallback,
    active: "#22c55e",
    inactive: "#64748b",
    running: "#22c55e",
    stopped: "#64748b",
    warning: "#f59e0b",
    alarm: "#ef4444",
    offline: "#94a3b8",
    disabled: "#cbd5e1"
  };
  return colors[state];
}

function styleShape(element: SVGElement, context: SvgSymbolRenderContext): void {
  element.setAttribute(
    "fill",
    stateColor(context.state, stringProperty(context, "fill", "#64748b"))
  );
  element.setAttribute("stroke", stringProperty(context, "stroke", "#0f172a"));
  element.setAttribute("stroke-width", String(numberProperty(context, "strokeWidth", 2)));
  element.setAttribute("opacity", String(numberProperty(context, "opacity", 1)));
  element.setAttribute("vector-effect", "non-scaling-stroke");
}

function appendLabel(group: SVGGElement, context: SvgSymbolRenderContext): void {
  if (!booleanProperty(context, "labelVisible", true)) return;
  const text = createSvgElement("text");
  text.textContent = context.node.name;
  text.setAttribute("x", String(context.node.transform.width / 2));
  text.setAttribute("y", String(context.node.transform.height + 16));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "12");
  text.setAttribute("fill", "#e2e8f0");
  text.setAttribute("class", "scada-symbol-label");
  group.append(text);
}

type DrawSymbol = (group: SVGGElement, context: SvgSymbolRenderContext) => void;

class DrawingSymbolRenderer implements SvgSymbolRenderer {
  public constructor(private readonly draw: DrawSymbol) {}

  public create(context: SvgSymbolRenderContext): SVGGElement {
    const group = createSvgElement("g");
    this.update(group, context);
    return group;
  }

  public update(element: SVGGElement, context: SvgSymbolRenderContext): void {
    element.replaceChildren();
    element.setAttribute("class", `scada-symbol ${runtimeStateClass(context.state)}`);
    this.draw(element, context);
  }

  public updateDesign(element: SVGGElement, context: SvgSymbolRenderContext): void {
    this.update(element, context);
  }

  public updateRuntime(element: SVGGElement, context: SvgSymbolRenderContext): void {
    const next = createSvgElement("g");
    next.setAttribute("class", `scada-symbol ${runtimeStateClass(context.state)}`);
    this.draw(next, context);
    synchronizeSvgElement(element, next);
  }

  public dispose(element: SVGGElement): void {
    element.replaceChildren();
  }
}

const rectangleRenderer = new DrawingSymbolRenderer((group, context) => {
  const rectangle = createSvgElement("rect");
  rectangle.setAttribute("width", String(context.node.transform.width));
  rectangle.setAttribute("height", String(context.node.transform.height));
  rectangle.setAttribute("rx", String(numberProperty(context, "cornerRadius", 4)));
  styleShape(rectangle, context);
  group.append(rectangle);
  appendLabel(group, context);
});

const textRenderer = new DrawingSymbolRenderer((group, context) => {
  const text = createSvgElement("text");
  text.textContent = stringProperty(context, "text", context.node.name);
  text.setAttribute("x", String(context.node.transform.width / 2));
  text.setAttribute("y", String(context.node.transform.height / 2));
  text.setAttribute("dominant-baseline", "middle");
  const alignment = stringProperty(context, "textAlign", "center");
  text.setAttribute(
    "text-anchor",
    alignment === "left" ? "start" : alignment === "right" ? "end" : "middle"
  );
  text.setAttribute("font-size", String(numberProperty(context, "fontSize", 18)));
  text.setAttribute("fill", stringProperty(context, "fill", "#e2e8f0"));
  group.append(text);
});

const tankRenderer = new DrawingSymbolRenderer((group, context) => {
  const body = createSvgElement("path");
  const { width, height } = context.node.transform;
  body.setAttribute(
    "d",
    `M 0 12 Q ${width / 2} 0 ${width} 12 L ${width} ${height - 12} Q ${width / 2} ${height} 0 ${height - 12} Z`
  );
  styleShape(body, context);
  group.append(body);
  const level = Math.max(0, Math.min(1, numberProperty(context, "level", 0.6)));
  const liquid = createSvgElement("rect");
  liquid.setAttribute("x", "4");
  liquid.setAttribute("y", String(4 + (height - 8) * (1 - level)));
  liquid.setAttribute("width", String(width - 8));
  liquid.setAttribute("height", String((height - 8) * level));
  liquid.setAttribute("fill", "#38bdf8");
  liquid.setAttribute("opacity", "0.65");
  group.append(liquid);
  appendLabel(group, context);
});

const pumpRenderer = new DrawingSymbolRenderer((group, context) => {
  const { width, height } = context.node.transform;
  const body = createSvgElement("circle");
  body.setAttribute("cx", String(width * 0.45));
  body.setAttribute("cy", String(height / 2));
  body.setAttribute("r", String(Math.min(width, height) * 0.38));
  styleShape(body, context);
  const outlet = createSvgElement("path");
  outlet.setAttribute(
    "d",
    `M ${width * 0.45} ${height * 0.28} L ${width * 0.82} ${height / 2} L ${width * 0.45} ${height * 0.72} Z`
  );
  outlet.setAttribute("fill", "#e2e8f0");
  group.append(body, outlet);
  appendLabel(group, context);
});

const valveRenderer = new DrawingSymbolRenderer((group, context) => {
  const { width, height } = context.node.transform;
  const shape = createSvgElement("path");
  shape.setAttribute(
    "d",
    `M 2 ${height * 0.2} L ${width / 2} ${height / 2} L 2 ${height * 0.8} Z M ${width - 2} ${height * 0.2} L ${width / 2} ${height / 2} L ${width - 2} ${height * 0.8} Z`
  );
  styleShape(shape, context);
  group.append(shape);
  appendLabel(group, context);
});

const motorRenderer = new DrawingSymbolRenderer((group, context) => {
  const { width, height } = context.node.transform;
  const body = createSvgElement("rect");
  body.setAttribute("x", "4");
  body.setAttribute("y", "4");
  body.setAttribute("width", String(width - 18));
  body.setAttribute("height", String(height - 8));
  body.setAttribute("rx", String(height / 2));
  styleShape(body, context);
  const shaft = createSvgElement("line");
  shaft.setAttribute("x1", String(width - 14));
  shaft.setAttribute("y1", String(height / 2));
  shaft.setAttribute("x2", String(width));
  shaft.setAttribute("y2", String(height / 2));
  shaft.setAttribute("stroke", "#e2e8f0");
  shaft.setAttribute("stroke-width", "6");
  const letter = createSvgElement("text");
  letter.textContent = "M";
  letter.setAttribute("x", String((width - 14) / 2));
  letter.setAttribute("y", String(height / 2));
  letter.setAttribute("text-anchor", "middle");
  letter.setAttribute("dominant-baseline", "middle");
  letter.setAttribute("font-size", String(height * 0.38));
  letter.setAttribute("fill", "#f8fafc");
  group.append(body, shaft, letter);
  appendLabel(group, context);
});

const sensorRenderer = new DrawingSymbolRenderer((group, context) => {
  const { width, height } = context.node.transform;
  const body = createSvgElement("circle");
  body.setAttribute("cx", String(width / 2));
  body.setAttribute("cy", String(height / 2));
  body.setAttribute("r", String(Math.min(width, height) / 2 - 3));
  styleShape(body, context);
  const text = createSvgElement("text");
  text.textContent = stringProperty(context, "code", "S");
  text.setAttribute("x", String(width / 2));
  text.setAttribute("y", String(height / 2));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("font-size", String(Math.min(width, height) * 0.4));
  text.setAttribute("fill", "#f8fafc");
  group.append(body, text);
  appendLabel(group, context);
});

const indicatorRenderer = new DrawingSymbolRenderer((group, context) => {
  const { width, height } = context.node.transform;
  const glow = createSvgElement("circle");
  glow.setAttribute("cx", String(width / 2));
  glow.setAttribute("cy", String(height / 2));
  glow.setAttribute("r", String(Math.min(width, height) / 2 - 3));
  styleShape(glow, context);
  group.append(glow);
  appendLabel(group, context);
});

export class InMemorySvgSymbolRendererRegistry implements SvgSymbolRendererRegistry {
  readonly #renderers = new Map<string, SvgSymbolRenderer>();

  public register(symbolType: string, renderer: SvgSymbolRenderer): void {
    this.#renderers.set(symbolType, renderer);
  }

  public get(symbolType: string): SvgSymbolRenderer | undefined {
    return this.#renderers.get(symbolType);
  }
}

export function createInitialSvgSymbolRendererRegistry(): InMemorySvgSymbolRendererRegistry {
  const registry = new InMemorySvgSymbolRendererRegistry();
  registry.register("basic.rectangle", rectangleRenderer);
  registry.register("basic.text", textRenderer);
  registry.register("equipment.tank", tankRenderer);
  registry.register("equipment.pump", pumpRenderer);
  registry.register("equipment.valve", valveRenderer);
  registry.register("equipment.motor", motorRenderer);
  registry.register("equipment.sensor", sensorRenderer);
  registry.register("equipment.indicator", indicatorRenderer);
  registerIndustrialSvgSymbolRenderers(registry);
  return registry;
}

export const FALLBACK_SYMBOL_RENDERER: SvgSymbolRenderer = new DrawingSymbolRenderer(
  (group, context) => {
    const rectangle = createSvgElement("rect");
    rectangle.setAttribute("width", String(context.node.transform.width));
    rectangle.setAttribute("height", String(context.node.transform.height));
    rectangle.setAttribute("fill", "#3f3f46");
    rectangle.setAttribute("stroke", "#f59e0b");
    rectangle.setAttribute("stroke-width", "2");
    rectangle.setAttribute("stroke-dasharray", "6 4");
    const text = createSvgElement("text");
    text.textContent = context.node.symbolType;
    text.setAttribute("x", String(context.node.transform.width / 2));
    text.setAttribute("y", String(context.node.transform.height / 2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", "#fef3c7");
    group.append(rectangle, text);
  }
);

export function jsonValueToString(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
