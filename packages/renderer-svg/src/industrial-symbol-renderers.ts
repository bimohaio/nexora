import { INDUSTRIAL_SYMBOL_TYPES, type SymbolState } from "@web-scada/symbols";
import type {
  SvgSymbolRenderContext,
  SvgSymbolRenderer,
  SvgSymbolRendererRegistry
} from "./contracts.js";
import { createSvgElement } from "./dom.js";

type IndustrialGlyph =
  | "pump"
  | "valve"
  | "tank-horizontal"
  | "tank-vertical"
  | "pipe"
  | "mixer"
  | "heat-exchanger"
  | "instrument"
  | "motor"
  | "transformer"
  | "breaker"
  | "switch"
  | "generator"
  | "power-source"
  | "fan"
  | "damper"
  | "ahu"
  | "coil"
  | "emergency-stop"
  | "beacon"
  | "siren"
  | "control";

interface IndustrialVisualDescriptor {
  readonly glyph: IndustrialGlyph;
  readonly code?: string;
  readonly accent?: string;
  readonly reverse?: boolean;
}

const DESCRIPTORS: Readonly<Record<string, IndustrialVisualDescriptor>> = {
  [INDUSTRIAL_SYMBOL_TYPES.centrifugalPump]: { glyph: "pump" },
  [INDUSTRIAL_SYMBOL_TYPES.gateValve]: { glyph: "valve", code: "G" },
  [INDUSTRIAL_SYMBOL_TYPES.globeValve]: { glyph: "valve", code: "GL" },
  [INDUSTRIAL_SYMBOL_TYPES.butterflyValve]: { glyph: "valve", code: "B" },
  [INDUSTRIAL_SYMBOL_TYPES.checkValve]: { glyph: "valve", code: "C" },
  [INDUSTRIAL_SYMBOL_TYPES.horizontalTank]: { glyph: "tank-horizontal" },
  [INDUSTRIAL_SYMBOL_TYPES.verticalTank]: { glyph: "tank-vertical" },
  [INDUSTRIAL_SYMBOL_TYPES.pipe]: { glyph: "pipe" },
  [INDUSTRIAL_SYMBOL_TYPES.mixer]: { glyph: "mixer" },
  [INDUSTRIAL_SYMBOL_TYPES.heatExchanger]: { glyph: "heat-exchanger" },
  [INDUSTRIAL_SYMBOL_TYPES.pressureSensor]: { glyph: "instrument", code: "P" },
  [INDUSTRIAL_SYMBOL_TYPES.temperatureSensor]: { glyph: "instrument", code: "T" },
  [INDUSTRIAL_SYMBOL_TYPES.flowSensor]: { glyph: "instrument", code: "F" },
  [INDUSTRIAL_SYMBOL_TYPES.levelSensor]: { glyph: "instrument", code: "L" },
  [INDUSTRIAL_SYMBOL_TYPES.indicator]: { glyph: "instrument", code: "I" },
  [INDUSTRIAL_SYMBOL_TYPES.transmitter]: { glyph: "instrument", code: "XT" },
  [INDUSTRIAL_SYMBOL_TYPES.controller]: { glyph: "instrument", code: "C" },
  [INDUSTRIAL_SYMBOL_TYPES.acMotor]: { glyph: "motor", code: "M" },
  [INDUSTRIAL_SYMBOL_TYPES.transformer]: { glyph: "transformer" },
  [INDUSTRIAL_SYMBOL_TYPES.circuitBreaker]: { glyph: "breaker" },
  [INDUSTRIAL_SYMBOL_TYPES.switch]: { glyph: "switch" },
  [INDUSTRIAL_SYMBOL_TYPES.generator]: { glyph: "generator", code: "G" },
  [INDUSTRIAL_SYMBOL_TYPES.powerSource]: { glyph: "power-source", code: "~" },
  [INDUSTRIAL_SYMBOL_TYPES.supplyFan]: { glyph: "fan", code: "S" },
  [INDUSTRIAL_SYMBOL_TYPES.exhaustFan]: { glyph: "fan", code: "E", reverse: true },
  [INDUSTRIAL_SYMBOL_TYPES.damper]: { glyph: "damper" },
  [INDUSTRIAL_SYMBOL_TYPES.ahu]: { glyph: "ahu", code: "AHU" },
  [INDUSTRIAL_SYMBOL_TYPES.coolingCoil]: {
    glyph: "coil",
    code: "C",
    accent: "#38bdf8"
  },
  [INDUSTRIAL_SYMBOL_TYPES.heatingCoil]: {
    glyph: "coil",
    code: "H",
    accent: "#fb923c"
  },
  [INDUSTRIAL_SYMBOL_TYPES.emergencyStop]: {
    glyph: "emergency-stop",
    code: "STOP",
    accent: "#ef4444"
  },
  [INDUSTRIAL_SYMBOL_TYPES.alarmBeacon]: {
    glyph: "beacon",
    accent: "#f59e0b"
  },
  [INDUSTRIAL_SYMBOL_TYPES.siren]: { glyph: "siren", accent: "#ef4444" },
  [INDUSTRIAL_SYMBOL_TYPES.plc]: { glyph: "control", code: "PLC" },
  [INDUSTRIAL_SYMBOL_TYPES.hmi]: { glyph: "control", code: "HMI" },
  [INDUSTRIAL_SYMBOL_TYPES.gateway]: { glyph: "control", code: "GW" },
  [INDUSTRIAL_SYMBOL_TYPES.server]: { glyph: "control", code: "SRV" },
  [INDUSTRIAL_SYMBOL_TYPES.networkSwitch]: { glyph: "control", code: "SW" }
};

function propertyString(context: SvgSymbolRenderContext, key: string, fallback: string): string {
  const value = context.node.properties[key];
  return typeof value === "string" ? value : fallback;
}

function propertyNumber(context: SvgSymbolRenderContext, key: string, fallback: number): number {
  const value = context.node.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stateFill(state: SymbolState, fallback: string): string {
  if (state === "alarm") return "#ef4444";
  if (state === "warning") return "#f59e0b";
  if (state === "active" || state === "running") return "#22c55e";
  if (state === "inactive" || state === "stopped") return "#64748b";
  if (state === "offline") return "#94a3b8";
  if (state === "disabled") return "#cbd5e1";
  return fallback;
}

function stylePrimary(element: SVGElement, context: SvgSymbolRenderContext): void {
  element.setAttribute(
    "fill",
    stateFill(context.state, propertyString(context, "fill", "#475569"))
  );
  element.setAttribute("stroke", propertyString(context, "stroke", "#0f172a"));
  element.setAttribute("stroke-width", String(propertyNumber(context, "strokeWidth", 2)));
  element.setAttribute("vector-effect", "non-scaling-stroke");
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke = "#e2e8f0",
  width = 2
): SVGLineElement {
  const element = createSvgElement("line");
  element.setAttribute("x1", String(x1));
  element.setAttribute("y1", String(y1));
  element.setAttribute("x2", String(x2));
  element.setAttribute("y2", String(y2));
  element.setAttribute("stroke", stroke);
  element.setAttribute("stroke-width", String(width));
  element.setAttribute("vector-effect", "non-scaling-stroke");
  return element;
}

function text(value: string, x: number, y: number, size: number, fill = "#f8fafc"): SVGTextElement {
  const element = createSvgElement("text");
  element.textContent = value;
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("text-anchor", "middle");
  element.setAttribute("dominant-baseline", "middle");
  element.setAttribute("font-size", String(size));
  element.setAttribute("font-family", "system-ui, sans-serif");
  element.setAttribute("font-weight", "700");
  element.setAttribute("fill", fill);
  element.setAttribute("pointer-events", "none");
  return element;
}

function path(data: string, fill = "none", stroke = "#e2e8f0"): SVGPathElement {
  const element = createSvgElement("path");
  element.setAttribute("d", data);
  element.setAttribute("fill", fill);
  element.setAttribute("stroke", stroke);
  element.setAttribute("stroke-width", "2");
  element.setAttribute("stroke-linejoin", "round");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("vector-effect", "non-scaling-stroke");
  return element;
}

function appendLabel(group: SVGGElement, context: SvgSymbolRenderContext): void {
  if (context.node.properties.labelVisible === false) return;
  const { width, height } = context.node.transform;
  const label = text(context.node.name, width / 2, height + 14, 11, "#cbd5e1");
  label.setAttribute("font-weight", "500");
  label.setAttribute("class", "scada-symbol-label");
  group.append(label);
}

function drawTank(group: SVGGElement, context: SvgSymbolRenderContext, horizontal: boolean): void {
  const { width, height } = context.node.transform;
  const body = createSvgElement("rect");
  body.setAttribute("x", "2");
  body.setAttribute("y", "2");
  body.setAttribute("width", String(width - 4));
  body.setAttribute("height", String(height - 4));
  body.setAttribute("rx", String(horizontal ? height / 2 : Math.min(18, width / 4)));
  stylePrimary(body, context);
  const level = Math.max(0, Math.min(1, propertyNumber(context, "level", 0.6)));
  const liquid = createSvgElement("rect");
  liquid.setAttribute("x", "6");
  liquid.setAttribute("y", String(6 + (height - 12) * (1 - level)));
  liquid.setAttribute("width", String(width - 12));
  liquid.setAttribute("height", String((height - 12) * level));
  liquid.setAttribute("rx", horizontal ? String(Math.min(8, height / 8)) : "2");
  liquid.setAttribute("fill", "#38bdf8");
  liquid.setAttribute("opacity", "0.65");
  group.append(body, liquid);
}

function drawInstrument(group: SVGGElement, context: SvgSymbolRenderContext, code: string): void {
  const { width, height } = context.node.transform;
  const radius = Math.min(width, height) / 2 - 3;
  const body = createSvgElement("circle");
  body.setAttribute("cx", String(width / 2));
  body.setAttribute("cy", String(height / 2));
  body.setAttribute("r", String(radius));
  stylePrimary(body, context);
  group.append(
    body,
    text(propertyString(context, "code", code), width / 2, height / 2, radius * 0.7)
  );
}

function drawFan(group: SVGGElement, context: SvgSymbolRenderContext, reverse: boolean): void {
  const { width, height } = context.node.transform;
  const radius = Math.min(width, height) / 2 - 4;
  const cx = width / 2;
  const cy = height / 2;
  const body = createSvgElement("circle");
  body.setAttribute("cx", String(cx));
  body.setAttribute("cy", String(cy));
  body.setAttribute("r", String(radius));
  stylePrimary(body, context);
  group.append(body);
  const direction = reverse ? -1 : 1;
  for (let index = 0; index < 3; index += 1) {
    const angle = (index * Math.PI * 2) / 3;
    const x = cx + Math.cos(angle) * radius * 0.72;
    const y = cy + Math.sin(angle) * radius * 0.72;
    group.append(
      path(
        `M ${cx} ${cy} Q ${cx + Math.cos(angle + direction) * radius * 0.55} ${cy + Math.sin(angle + direction) * radius * 0.55} ${x} ${y}`,
        "none",
        "#f8fafc"
      )
    );
  }
}

function drawControl(group: SVGGElement, context: SvgSymbolRenderContext, code: string): void {
  const { width, height } = context.node.transform;
  const body = createSvgElement("rect");
  body.setAttribute("x", "2");
  body.setAttribute("y", "2");
  body.setAttribute("width", String(width - 4));
  body.setAttribute("height", String(height - 4));
  body.setAttribute("rx", "7");
  stylePrimary(body, context);
  const screen = createSvgElement("rect");
  screen.setAttribute("x", String(width * 0.14));
  screen.setAttribute("y", String(height * 0.18));
  screen.setAttribute("width", String(width * 0.72));
  screen.setAttribute("height", String(height * 0.45));
  screen.setAttribute("rx", "3");
  screen.setAttribute("fill", "#0f172a");
  screen.setAttribute("stroke", "#94a3b8");
  group.append(body, screen, text(code, width / 2, height * 0.41, Math.min(18, height * 0.2)));
  for (let index = 0; index < 4; index += 1) {
    const led = createSvgElement("circle");
    led.setAttribute("cx", String(width * (0.28 + index * 0.15)));
    led.setAttribute("cy", String(height * 0.78));
    led.setAttribute("r", "2.5");
    led.setAttribute("fill", index === 0 ? "#22c55e" : "#64748b");
    group.append(led);
  }
}

function drawGlyph(
  group: SVGGElement,
  context: SvgSymbolRenderContext,
  descriptor: IndustrialVisualDescriptor
): void {
  const { width, height } = context.node.transform;
  const cx = width / 2;
  const cy = height / 2;
  const accent = descriptor.accent ?? "#e2e8f0";
  if (descriptor.glyph === "pump") {
    const body = createSvgElement("circle");
    body.setAttribute("cx", String(width * 0.43));
    body.setAttribute("cy", String(cy));
    body.setAttribute("r", String(Math.min(width, height) * 0.38));
    stylePrimary(body, context);
    group.append(
      body,
      path(
        `M ${width * 0.4} ${height * 0.25} Q ${width * 0.78} ${cy} ${width * 0.4} ${height * 0.75} Z`,
        accent,
        accent
      )
    );
  } else if (descriptor.glyph === "valve") {
    group.append(
      path(
        `M 3 ${height * 0.2} L ${cx} ${cy} L 3 ${height * 0.8} Z M ${width - 3} ${height * 0.2} L ${cx} ${cy} L ${width - 3} ${height * 0.8} Z`,
        stateFill(context.state, propertyString(context, "fill", "#475569")),
        propertyString(context, "stroke", "#0f172a")
      ),
      text(descriptor.code ?? "V", cx, cy, Math.min(16, height * 0.24))
    );
  } else if (descriptor.glyph === "tank-horizontal") drawTank(group, context, true);
  else if (descriptor.glyph === "tank-vertical") drawTank(group, context, false);
  else if (descriptor.glyph === "pipe") {
    group.append(
      line(4, cy, width - 4, cy, stateFill(context.state, "#38bdf8"), Math.max(5, height * 0.3)),
      path(
        `M ${width * 0.58} ${height * 0.25} L ${width * 0.78} ${cy} L ${width * 0.58} ${height * 0.75}`,
        "none",
        "#f8fafc"
      )
    );
  } else if (descriptor.glyph === "mixer") {
    drawTank(group, context, false);
    group.append(
      line(cx, 0, cx, height * 0.72, "#f8fafc", 3),
      line(width * 0.25, height * 0.72, width * 0.75, height * 0.72, "#f8fafc", 4)
    );
  } else if (descriptor.glyph === "heat-exchanger") {
    const shell = createSvgElement("rect");
    shell.setAttribute("x", "2");
    shell.setAttribute("y", String(height * 0.12));
    shell.setAttribute("width", String(width - 4));
    shell.setAttribute("height", String(height * 0.76));
    shell.setAttribute("rx", String(height * 0.38));
    stylePrimary(shell, context);
    group.append(
      shell,
      path(
        `M ${width * 0.12} ${height * 0.35} C ${width * 0.35} ${height * 0.1}, ${width * 0.65} ${height * 0.6}, ${width * 0.88} ${height * 0.35} M ${width * 0.12} ${height * 0.65} C ${width * 0.35} ${height * 0.4}, ${width * 0.65} ${height * 0.9}, ${width * 0.88} ${height * 0.65}`
      )
    );
  } else if (descriptor.glyph === "instrument")
    drawInstrument(group, context, descriptor.code ?? "I");
  else if (descriptor.glyph === "motor" || descriptor.glyph === "generator") {
    const body = createSvgElement("circle");
    body.setAttribute("cx", String(cx));
    body.setAttribute("cy", String(cy));
    body.setAttribute("r", String(Math.min(width, height) / 2 - 4));
    stylePrimary(body, context);
    group.append(body, text(descriptor.code ?? "M", cx, cy, Math.min(width, height) * 0.35));
  } else if (descriptor.glyph === "transformer") {
    const radius = Math.min(width, height) * 0.28;
    for (const offset of [-radius * 0.55, radius * 0.55]) {
      const coil = createSvgElement("circle");
      coil.setAttribute("cx", String(cx + offset));
      coil.setAttribute("cy", String(cy));
      coil.setAttribute("r", String(radius));
      coil.setAttribute("fill", "none");
      coil.setAttribute("stroke", stateFill(context.state, "#f8fafc"));
      coil.setAttribute("stroke-width", "3");
      group.append(coil);
    }
  } else if (descriptor.glyph === "breaker" || descriptor.glyph === "switch") {
    group.append(
      line(0, cy, width * 0.3, cy, "#e2e8f0", 3),
      line(width * 0.7, cy, width, cy, "#e2e8f0", 3),
      line(width * 0.3, cy, width * 0.7, height * 0.25, stateFill(context.state, "#f8fafc"), 4)
    );
    if (descriptor.glyph === "breaker")
      group.append(
        path(
          `M ${width * 0.42} ${height * 0.22} L ${width * 0.5} ${height * 0.5} L ${width * 0.58} ${height * 0.22}`
        )
      );
  } else if (descriptor.glyph === "power-source") {
    drawInstrument(group, context, descriptor.code ?? "~");
    group.append(line(cx, 0, cx, height * 0.15), line(cx, height * 0.85, cx, height));
  } else if (descriptor.glyph === "fan") drawFan(group, context, descriptor.reverse === true);
  else if (descriptor.glyph === "damper") {
    const frame = createSvgElement("rect");
    frame.setAttribute("x", "2");
    frame.setAttribute("y", String(height * 0.15));
    frame.setAttribute("width", String(width - 4));
    frame.setAttribute("height", String(height * 0.7));
    frame.setAttribute("fill", "none");
    frame.setAttribute("stroke", "#94a3b8");
    frame.setAttribute("stroke-width", "2");
    group.append(frame);
    for (let index = 1; index < 5; index += 1)
      group.append(
        line(
          width * 0.08,
          height * (0.12 + index * 0.15),
          width * 0.92,
          height * (index * 0.15),
          accent
        )
      );
  } else if (descriptor.glyph === "ahu") {
    const body = createSvgElement("rect");
    body.setAttribute("x", "2");
    body.setAttribute("y", "2");
    body.setAttribute("width", String(width - 4));
    body.setAttribute("height", String(height - 4));
    body.setAttribute("rx", "6");
    stylePrimary(body, context);
    group.append(
      body,
      line(width / 3, 3, width / 3, height - 3),
      line((width * 2) / 3, 3, (width * 2) / 3, height - 3)
    );
    drawFan(group, context, false);
    group.append(text("AHU", width * 0.82, cy, Math.min(15, height * 0.18)));
  } else if (descriptor.glyph === "coil") {
    const frame = createSvgElement("rect");
    frame.setAttribute("x", "2");
    frame.setAttribute("y", "2");
    frame.setAttribute("width", String(width - 4));
    frame.setAttribute("height", String(height - 4));
    frame.setAttribute("fill", "#1e293b");
    frame.setAttribute("stroke", accent);
    frame.setAttribute("stroke-width", "2");
    group.append(
      frame,
      path(
        `M ${width * 0.12} ${height * 0.2} L ${width * 0.3} ${height * 0.8} L ${width * 0.5} ${height * 0.2} L ${width * 0.7} ${height * 0.8} L ${width * 0.88} ${height * 0.2}`,
        "none",
        accent
      ),
      text(descriptor.code ?? "", cx, cy, Math.min(15, height * 0.2))
    );
  } else if (descriptor.glyph === "emergency-stop") {
    const outer = createSvgElement("circle");
    outer.setAttribute("cx", String(cx));
    outer.setAttribute("cy", String(cy));
    outer.setAttribute("r", String(Math.min(width, height) / 2 - 2));
    outer.setAttribute("fill", "#facc15");
    outer.setAttribute("stroke", "#7f1d1d");
    outer.setAttribute("stroke-width", "3");
    const inner = createSvgElement("circle");
    inner.setAttribute("cx", String(cx));
    inner.setAttribute("cy", String(cy));
    inner.setAttribute("r", String(Math.min(width, height) * 0.32));
    inner.setAttribute("fill", stateFill(context.state, accent));
    group.append(outer, inner, text("STOP", cx, cy, Math.min(11, width * 0.14)));
  } else if (descriptor.glyph === "beacon") {
    const dome = path(
      `M ${width * 0.2} ${height * 0.72} L ${width * 0.28} ${height * 0.28} Q ${cx} ${height * 0.05} ${width * 0.72} ${height * 0.28} L ${width * 0.8} ${height * 0.72} Z`,
      stateFill(context.state, accent),
      "#7f1d1d"
    );
    group.append(
      dome,
      line(width * 0.12, height * 0.78, width * 0.88, height * 0.78, "#e2e8f0", 5)
    );
  } else if (descriptor.glyph === "siren") {
    group.append(
      path(
        `M ${width * 0.12} ${height * 0.38} L ${width * 0.55} ${height * 0.15} L ${width * 0.55} ${height * 0.85} L ${width * 0.12} ${height * 0.62} Z`,
        stateFill(context.state, accent),
        "#7f1d1d"
      ),
      path(
        `M ${width * 0.65} ${height * 0.3} Q ${width * 0.9} ${cy} ${width * 0.65} ${height * 0.7}`
      )
    );
  } else drawControl(group, context, descriptor.code ?? "");
}

class IndustrialSvgSymbolRenderer implements SvgSymbolRenderer {
  public constructor(private readonly descriptor: IndustrialVisualDescriptor) {}

  public create(context: SvgSymbolRenderContext): SVGGElement {
    const group = createSvgElement("g");
    this.update(group, context);
    return group;
  }

  public update(element: SVGGElement, context: SvgSymbolRenderContext): void {
    element.replaceChildren();
    element.setAttribute("class", `scada-symbol scada-state-${context.state}`);
    drawGlyph(element, context, this.descriptor);
    appendLabel(element, context);
  }

  public dispose(element: SVGGElement): void {
    element.replaceChildren();
  }
}

export function registerIndustrialSvgSymbolRenderers(registry: SvgSymbolRendererRegistry): void {
  for (const [type, descriptor] of Object.entries(DESCRIPTORS))
    registry.register(type, new IndustrialSvgSymbolRenderer(descriptor));
}
