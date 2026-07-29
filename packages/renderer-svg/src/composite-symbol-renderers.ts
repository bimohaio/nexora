import { COMPOSITE_CATALOG, type SymbolState } from "@web-scada/symbols";
import type {
  SvgSymbolRenderContext,
  SvgSymbolRenderer,
  SvgSymbolRendererRegistry
} from "./contracts.js";
import { createSvgElement, synchronizeSvgElement } from "./dom.js";

type DrawFamily = (group: SVGGElement, context: SvgSymbolRenderContext, kind: string) => void;

function stringProperty(context: SvgSymbolRenderContext, key: string, fallback: string): string {
  const value = context.node.properties[key];
  return typeof value === "string" ? value : fallback;
}

function numberProperty(context: SvgSymbolRenderContext, key: string, fallback: number): number {
  const value = context.node.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function operationalFill(state: SymbolState, fallback: string): string {
  if (["alarm", "fault", "communication-lost"].includes(state)) return "#dc2626";
  if (state === "warning") return "#f59e0b";
  if (["active", "running", "open", "on"].includes(state)) return "#16a34a";
  if (["disabled", "unavailable", "offline", "unknown"].includes(state)) return "#94a3b8";
  return fallback;
}

function shape<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Readonly<Record<string, string | number>>
): SVGElementTagNameMap[K] {
  const result = createSvgElement(name);
  for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, String(value));
  result.setAttribute("vector-effect", "non-scaling-stroke");
  return result;
}

function style(element: SVGElement, context: SvgSymbolRenderContext, fill = "#475569"): void {
  element.setAttribute(
    "fill",
    operationalFill(context.state, stringProperty(context, "fill", fill))
  );
  element.setAttribute("stroke", stringProperty(context, "stroke", "#0f172a"));
  element.setAttribute("stroke-width", String(numberProperty(context, "strokeWidth", 2)));
  element.setAttribute("stroke-linejoin", "round");
  element.setAttribute("stroke-linecap", "round");
}

function label(group: SVGGElement, context: SvgSymbolRenderContext, kind: string): void {
  if (context.node.properties.labelVisible === false) return;
  const { width, height } = context.node.transform;
  const text = shape("text", {
    x: width / 2,
    y: height + 14,
    "text-anchor": "middle",
    "font-size": 11,
    fill: "#e2e8f0"
  });
  text.textContent = context.node.name || kind.replaceAll("-", " ");
  group.append(text);
}

function marker(group: SVGGElement, width: number, height: number, kind: string): void {
  let hash = 0;
  for (const character of kind) hash += character.codePointAt(0) ?? 0;
  const count = 1 + (hash % 4);
  for (let index = 0; index < count; index += 1)
    group.append(
      shape("line", {
        x1: width * (0.35 + index * 0.1),
        y1: height * 0.72,
        x2: width * (0.35 + index * 0.1),
        y2: height * 0.84,
        stroke: "#e2e8f0",
        "stroke-width": 1.5
      })
    );
}

const drawIndicator: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const stacked = kind.includes("stack-light") || kind.includes("beacon");
  if (stacked) {
    const segments = Number(
      /\d/.exec(kind)?.[0] ?? (kind.includes("triple") ? 3 : kind.includes("dual") ? 2 : 1)
    );
    for (let index = 0; index < segments; index += 1) {
      const lamp = shape("rect", {
        x: width * 0.32,
        y: height * (0.08 + (index * 0.75) / segments),
        width: width * 0.36,
        height: (height * 0.6) / segments,
        rx: 5
      });
      style(lamp, context, index % 2 === 0 ? "#22c55e" : "#f59e0b");
      group.append(lamp);
    }
  } else {
    const lamp = kind.includes("square")
      ? shape("rect", {
          x: width * 0.2,
          y: height * 0.12,
          width: width * 0.6,
          height: height * 0.7,
          rx: 4
        })
      : shape("circle", { cx: width / 2, cy: height * 0.46, r: Math.min(width, height) * 0.32 });
    style(lamp, context, "#22c55e");
    group.append(lamp);
  }
  label(group, context, kind);
};

const drawControl: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = kind.includes("emergency")
    ? shape("circle", { cx: width / 2, cy: height * 0.45, r: Math.min(width, height) * 0.36 })
    : shape("rect", {
        x: width * 0.12,
        y: height * 0.12,
        width: width * 0.76,
        height: height * 0.65,
        rx: kind.includes("switch") ? 18 : 7
      });
  style(body, context, kind.includes("stop") || kind.includes("emergency") ? "#dc2626" : "#2563eb");
  group.append(body);
  if (kind.includes("switch"))
    group.append(
      shape("line", {
        x1: width * 0.5,
        y1: height * 0.45,
        x2: width * 0.72,
        y2: height * 0.22,
        stroke: "#f8fafc",
        "stroke-width": 5
      })
    );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawValve: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const left = shape("path", {
    d: `M 4 ${height / 2} L ${width / 2} ${height * 0.16} L ${width / 2} ${height * 0.84} Z`
  });
  const right = shape("path", {
    d: `M ${width - 4} ${height / 2} L ${width / 2} ${height * 0.16} L ${width / 2} ${height * 0.84} Z`
  });
  style(left, context);
  style(right, context);
  group.append(left, right);
  if (kind.includes("control") || kind.includes("motorized") || kind.includes("solenoid"))
    group.append(
      shape("rect", {
        x: width * 0.38,
        y: 2,
        width: width * 0.24,
        height: height * 0.22,
        rx: 2,
        fill: "#64748b",
        stroke: "#0f172a",
        "stroke-width": 2
      })
    );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawPump: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = shape("circle", {
    cx: width * 0.47,
    cy: height * 0.46,
    r: Math.min(width, height) * 0.34
  });
  style(body, context);
  const impeller = shape("path", {
    d: `M ${width * 0.3} ${height * 0.62} Q ${width * 0.55} ${height * 0.65} ${width * 0.7} ${height * 0.28} L ${width * 0.68} ${height * 0.6} Z`,
    fill: "none",
    stroke: "#e2e8f0",
    "stroke-width": 2
  });
  group.append(
    body,
    impeller,
    shape("line", {
      x1: width * 0.8,
      y1: height * 0.46,
      x2: width,
      y2: height * 0.46,
      stroke: "#0f172a",
      "stroke-width": 4
    })
  );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawMotor: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = shape("rect", {
    x: width * 0.12,
    y: height * 0.14,
    width: width * 0.67,
    height: height * 0.63,
    rx: height * 0.18
  });
  style(body, context);
  group.append(
    body,
    shape("line", {
      x1: width * 0.79,
      y1: height * 0.46,
      x2: width,
      y2: height * 0.46,
      stroke: "#0f172a",
      "stroke-width": 5
    })
  );
  const text = shape("text", {
    x: width * 0.45,
    y: height * 0.52,
    "text-anchor": "middle",
    "font-size": Math.min(width, height) * 0.28,
    fill: "#f8fafc"
  });
  text.textContent = kind.includes("dc-") ? "DC" : kind.includes("servo") ? "S" : "M";
  group.append(text);
  label(group, context, kind);
};

const drawPipe: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const path =
    kind.includes("elbow") || kind.includes("bend")
      ? `M 4 ${height * 0.8} H ${width * 0.55} Q ${width * 0.8} ${height * 0.8} ${width * 0.8} ${height * 0.5} V 4`
      : kind === "tee"
        ? `M 4 ${height / 2} H ${width - 4} M ${width / 2} ${height / 2} V 4`
        : kind === "cross"
          ? `M 4 ${height / 2} H ${width - 4} M ${width / 2} 4 V ${height - 4}`
          : `M 4 ${height / 2} H ${width - 4}`;
  group.append(
    shape("path", {
      d: path,
      fill: "none",
      stroke: operationalFill(context.state, stringProperty(context, "fill", "#38bdf8")),
      "stroke-width": Math.max(6, height * 0.22),
      "stroke-linecap": "butt",
      "stroke-linejoin": "round"
    })
  );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawVessel: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const horizontal = kind.includes("horizontal") || kind.includes("farm");
  const body = shape(
    "rect",
    horizontal
      ? { x: 5, y: height * 0.2, width: width - 10, height: height * 0.58, rx: height * 0.25 }
      : { x: width * 0.18, y: 4, width: width * 0.64, height: height * 0.88, rx: width * 0.25 }
  );
  style(body, context);
  group.append(body);
  if (kind.includes("mixing") || kind.includes("reactor"))
    group.append(
      shape("path", {
        d: `M ${width / 2} 4 V ${height * 0.65} M ${width * 0.35} ${height * 0.58} L ${width / 2} ${height * 0.68} L ${width * 0.65} ${height * 0.58}`,
        fill: "none",
        stroke: "#e2e8f0",
        "stroke-width": 3
      })
    );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawConveyor: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const frame = shape("rect", {
    x: 4,
    y: height * 0.2,
    width: width - 8,
    height: height * 0.48,
    rx: height * 0.2
  });
  style(frame, context);
  group.append(frame);
  const count = kind.includes("roller") ? 8 : 5;
  for (let index = 0; index < count; index += 1)
    group.append(
      shape("circle", {
        cx: width * (0.1 + (index * 0.8) / (count - 1)),
        cy: height * 0.44,
        r: height * 0.1,
        fill: "#cbd5e1",
        stroke: "#334155",
        "stroke-width": 1
      })
    );
  label(group, context, kind);
};

const drawProcess: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = shape("path", {
    d: `M ${width * 0.15} ${height * 0.12} H ${width * 0.85} L ${width * 0.75} ${height * 0.82} H ${width * 0.25} Z`
  });
  style(body, context);
  group.append(body);
  if (kind.includes("heat-exchanger") || kind.includes("cool"))
    group.append(
      shape("path", {
        d: `M ${width * 0.27} ${height * 0.3} Q ${width * 0.4} ${height * 0.15} ${width * 0.5} ${height * 0.3} T ${width * 0.73} ${height * 0.3} M ${width * 0.27} ${height * 0.55} Q ${width * 0.4} ${height * 0.4} ${width * 0.5} ${height * 0.55} T ${width * 0.73} ${height * 0.55}`,
        fill: "none",
        stroke: "#e2e8f0",
        "stroke-width": 2
      })
    );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawInstrument: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = shape("circle", {
    cx: width / 2,
    cy: height * 0.45,
    r: Math.min(width, height) * 0.36
  });
  style(body, context, "#f8fafc");
  group.append(body);
  const code = kind
    .split("-")
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const text = shape("text", {
    x: width / 2,
    y: height * 0.51,
    "text-anchor": "middle",
    "font-size": Math.min(width, height) * 0.2,
    fill: "#0f172a",
    "font-weight": 700
  });
  text.textContent = code;
  group.append(text);
  label(group, context, kind);
};

const drawElectrical: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const body = shape("rect", {
    x: width * 0.16,
    y: height * 0.1,
    width: width * 0.68,
    height: height * 0.7,
    rx: 5
  });
  style(body, context);
  group.append(body);
  const bolt = shape("path", {
    d: `M ${width * 0.55} ${height * 0.18} L ${width * 0.35} ${height * 0.48} H ${width * 0.51} L ${width * 0.43} ${height * 0.72} L ${width * 0.68} ${height * 0.39} H ${width * 0.52} Z`,
    fill: "#facc15",
    stroke: "#713f12",
    "stroke-width": 1
  });
  group.append(bolt);
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawHvac: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const frame = shape("rect", { x: 4, y: 4, width: width - 8, height: height * 0.76, rx: 5 });
  style(frame, context);
  group.append(frame);
  const centerX = width / 2;
  const centerY = height * 0.42;
  for (let index = 0; index < 4; index += 1)
    group.append(
      shape("ellipse", {
        cx: centerX,
        cy: centerY - height * 0.17,
        rx: width * 0.1,
        ry: height * 0.2,
        fill: "#bae6fd",
        stroke: "#0369a1",
        "stroke-width": 1,
        transform: `rotate(${index * 90} ${centerX} ${centerY})`
      })
    );
  group.append(shape("circle", { cx: centerX, cy: centerY, r: 4, fill: "#0f172a" }));
  label(group, context, kind);
};

const drawDisplay: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const panel = shape("rect", { x: 3, y: 3, width: width - 6, height: height * 0.78, rx: 5 });
  style(panel, context, "#1e293b");
  group.append(panel);
  if (kind.includes("gauge"))
    group.append(
      shape("path", {
        d: `M ${width * 0.2} ${height * 0.62} A ${width * 0.3} ${height * 0.35} 0 0 1 ${width * 0.8} ${height * 0.62} M ${width / 2} ${height * 0.6} L ${width * 0.67} ${height * 0.3}`,
        fill: "none",
        stroke: "#38bdf8",
        "stroke-width": 3
      })
    );
  else
    group.append(
      shape("polyline", {
        points: `${width * 0.12},${height * 0.58} ${width * 0.3},${height * 0.32} ${width * 0.48},${height * 0.5} ${width * 0.67},${height * 0.2} ${width * 0.88},${height * 0.4}`,
        fill: "none",
        stroke: "#38bdf8",
        "stroke-width": 3
      })
    );
  label(group, context, kind);
};

const drawLayout: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const panel = shape("rect", {
    x: 3,
    y: 3,
    width: width - 6,
    height: height * 0.78,
    rx: kind.includes("popup") ? 9 : 2
  });
  style(panel, context, "#334155");
  panel.setAttribute("fill-opacity", "0.35");
  group.append(
    panel,
    shape("line", {
      x1: 4,
      y1: height * 0.22,
      x2: width - 4,
      y2: height * 0.22,
      stroke: "#94a3b8",
      "stroke-width": 2
    })
  );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawAuthoring: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  if (kind.includes("arrow"))
    group.append(
      shape("path", {
        d: `M 5 ${height / 2} H ${width * 0.76} M ${width * 0.58} ${height * 0.2} L ${width * 0.82} ${height / 2} L ${width * 0.58} ${height * 0.8}`,
        fill: "none",
        stroke: "#38bdf8",
        "stroke-width": 4
      })
    );
  else {
    const box = shape("rect", {
      x: 4,
      y: 4,
      width: width - 8,
      height: height * 0.72,
      fill: "none",
      stroke: "#38bdf8",
      "stroke-width": 2,
      "stroke-dasharray": kind.includes("selection") || kind.includes("bounding") ? "6 4" : "none"
    });
    group.append(
      box,
      shape("line", {
        x1: width * 0.2,
        y1: height * 0.25,
        x2: width * 0.8,
        y2: height * 0.25,
        stroke: "#94a3b8",
        "stroke-width": 2
      })
    );
  }
  label(group, context, kind);
};

const drawAutomation: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  const base = shape("rect", {
    x: width * 0.2,
    y: height * 0.72,
    width: width * 0.6,
    height: height * 0.16,
    rx: 3
  });
  style(base, context);
  group.append(base);
  const arm = shape("path", {
    d: `M ${width * 0.35} ${height * 0.72} L ${width * 0.4} ${height * 0.46} L ${width * 0.63} ${height * 0.27} L ${width * 0.8} ${height * 0.42}`,
    fill: "none",
    stroke: operationalFill(context.state, "#64748b"),
    "stroke-width": 9,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  group.append(arm);
  for (const [x, y] of [
    [0.4, 0.46],
    [0.63, 0.27],
    [0.8, 0.42]
  ] as const)
    group.append(
      shape("circle", {
        cx: width * x,
        cy: height * y,
        r: 5,
        fill: "#cbd5e1",
        stroke: "#0f172a",
        "stroke-width": 2
      })
    );
  marker(group, width, height, kind);
  label(group, context, kind);
};

const drawOilGas: DrawFamily = (group, context, kind) => {
  const { width, height } = context.node.transform;
  if (kind.includes("sphere")) {
    const sphere = shape("circle", {
      cx: width / 2,
      cy: height * 0.42,
      r: Math.min(width, height) * 0.34
    });
    style(sphere, context);
    group.append(sphere);
  } else {
    const tower = shape("path", {
      d: `M ${width * 0.35} ${height * 0.82} L ${width * 0.42} ${height * 0.08} H ${width * 0.58} L ${width * 0.65} ${height * 0.82} Z`
    });
    style(tower, context);
    group.append(tower);
    for (const y of [0.28, 0.46, 0.64])
      group.append(
        shape("line", {
          x1: width * 0.39,
          y1: height * y,
          x2: width * 0.61,
          y2: height * y,
          stroke: "#e2e8f0",
          "stroke-width": 2
        })
      );
  }
  marker(group, width, height, kind);
  label(group, context, kind);
};

const FAMILY_DRAWERS: Readonly<Record<string, DrawFamily>> = Object.freeze({
  indicator: drawIndicator,
  control: drawControl,
  valve: drawValve,
  pump: drawPump,
  motor: drawMotor,
  pipe: drawPipe,
  vessel: drawVessel,
  conveyor: drawConveyor,
  "process-equipment": drawProcess,
  instrument: drawInstrument,
  electrical: drawElectrical,
  hvac: drawHvac,
  display: drawDisplay,
  layout: drawLayout,
  authoring: drawAuthoring,
  automation: drawAutomation,
  "oil-gas": drawOilGas
});

class CompositeFamilyRenderer implements SvgSymbolRenderer {
  public constructor(
    private readonly draw: DrawFamily,
    private readonly kind: string
  ) {}

  public create(context: SvgSymbolRenderContext): SVGGElement {
    const group = createSvgElement("g");
    this.update(group, context);
    return group;
  }

  public update(group: SVGGElement, context: SvgSymbolRenderContext): void {
    group.replaceChildren();
    group.setAttribute("class", `scada-symbol scada-state-${context.state}`);
    this.draw(group, context, this.kind);
  }

  public updateDesign(group: SVGGElement, context: SvgSymbolRenderContext): void {
    this.update(group, context);
  }

  public updateRuntime(group: SVGGElement, context: SvgSymbolRenderContext): void {
    const next = createSvgElement("g");
    this.update(next, context);
    synchronizeSvgElement(group, next);
  }

  public dispose(group: SVGGElement): void {
    group.replaceChildren();
  }
}

export function registerCompositeSvgSymbolRenderers(registry: SvgSymbolRendererRegistry): void {
  for (const entry of COMPOSITE_CATALOG) {
    const drawer = FAMILY_DRAWERS[entry.family];
    if (drawer === undefined) throw new Error(`Unknown composite visual family: ${entry.family}`);
    registry.register(entry.type, new CompositeFamilyRenderer(drawer, entry.visualKind));
  }
}
