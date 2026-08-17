import type { ScadaDocument } from "@web-scada/core";
import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";

export type RuntimeDemoSampleId = "water" | "power" | "factory" | "building" | "tank-farm";

export interface RuntimeDemoSample {
  readonly id: RuntimeDemoSampleId;
  readonly label: string;
  readonly document: ScadaDocument;
}

interface ScenarioOptions {
  readonly id: RuntimeDemoSampleId;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly background: string;
  readonly accent: string;
}

function scenario(options: ScenarioOptions): RuntimeDemoSample {
  const source = WATER_TREATMENT_DOCUMENT;
  const titleNodeId = "node_title";
  return Object.freeze({
    id: options.id,
    label: options.label,
    document: {
      ...source,
      id: `doc_runtime_${options.id}`,
      metadata: {
        ...source.metadata,
        name: options.label,
        description: options.description,
        tags: [options.id, "runtime", "phase-10"]
      },
      canvas: { ...source.canvas, background: options.background },
      nodes: source.nodes.map((node) =>
        node.id === titleNodeId
          ? {
              ...node,
              properties: { ...node.properties, text: options.title, fill: options.accent }
            }
          : node
      )
    }
  });
}

export const RUNTIME_DEMO_SAMPLES: readonly RuntimeDemoSample[] = Object.freeze([
  scenario({
    id: "water",
    label: "Water Treatment",
    title: "WATER TREATMENT · RUNTIME CONTROL LINE",
    description: "Treatment tanks, pumps, valves, instrumentation and animated process flow.",
    background: "#07111f",
    accent: "#e2e8f0"
  }),
  scenario({
    id: "power",
    label: "Power Distribution",
    title: "POWER DISTRIBUTION · LIVE OPERATIONS",
    description: "Power distribution training scenario with live state and alarm transitions.",
    background: "#11100a",
    accent: "#fde68a"
  }),
  scenario({
    id: "factory",
    label: "Factory Production Line",
    title: "FACTORY PRODUCTION · LIVE LINE",
    description: "Production line scenario with rotating equipment, flow and quality changes.",
    background: "#0f1115",
    accent: "#d1d5db"
  }),
  scenario({
    id: "building",
    label: "Building Management System",
    title: "BUILDING MANAGEMENT · HVAC OPERATIONS",
    description: "Building services scenario with live sensors, equipment and visibility states.",
    background: "#07150f",
    accent: "#bbf7d0"
  }),
  scenario({
    id: "tank-farm",
    label: "Tank Farm",
    title: "TANK FARM · TRANSFER OPERATIONS",
    description:
      "Storage and transfer scenario with tank levels, valves, alarms and animated flow.",
    background: "#130b16",
    accent: "#f5d0fe"
  })
]);

export function getRuntimeDemoSample(id: string | null | undefined): RuntimeDemoSample {
  const matched = RUNTIME_DEMO_SAMPLES.find((sample) => sample.id === id);
  if (matched !== undefined) return matched;
  const fallback = RUNTIME_DEMO_SAMPLES[0];
  if (fallback === undefined) throw new Error("Runtime demo sample catalog is empty.");
  return fallback;
}
