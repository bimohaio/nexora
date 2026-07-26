import { createEmptyChangeSet, type ScadaDocument, type ScadaNode } from "@web-scada/core";
import { createSvgRenderer, type SvgRenderer } from "@web-scada/renderer-svg";
import {
  createIndustrialSymbolRegistry,
  type SymbolDefinition,
  type SymbolState
} from "@web-scada/symbols";

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 170;

export interface SymbolGalleryController {
  setState(state: string): void;
  setMinimumSize(enabled: boolean): void;
  dispose(): void;
}

interface Preview {
  readonly definition: SymbolDefinition;
  readonly renderer: SvgRenderer;
  readonly defaultDocument: ScadaDocument;
  state: SymbolState;
}

function previewNode(definition: SymbolDefinition, useMinimumSize: boolean): ScadaNode {
  const width = useMinimumSize ? definition.minimumWidth : definition.defaultWidth;
  const height = useMinimumSize ? definition.minimumHeight : definition.defaultHeight;
  return {
    id: `preview_${definition.type.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
    name: definition.type.slice(definition.type.indexOf(".") + 1).replaceAll("-", " "),
    symbolType: definition.type,
    transform: {
      x: (PREVIEW_WIDTH - width) / 2,
      y: Math.max(8, (PREVIEW_HEIGHT - height) / 2 - 6),
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    properties: { labelVisible: false },
    bindings: [],
    layerId: "preview",
    visible: true,
    locked: false
  };
}

export function createSymbolPreviewDocument(
  definition: SymbolDefinition,
  useMinimumSize = false
): ScadaDocument {
  return {
    schemaVersion: "1.0.0",
    id: `gallery_${definition.type.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
    metadata: {
      name: `${definition.type} preview`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: ["symbol-gallery"]
    },
    canvas: {
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      background: "transparent",
      gridSize: 10,
      gridVisible: false,
      snapToGrid: false,
      coordinateUnit: "logical",
      defaultViewport: { x: 0, y: 0, zoom: 1 }
    },
    layers: [{ id: "preview", name: "Preview", order: 0, visible: true, locked: false }],
    nodes: [previewNode(definition, useMinimumSize)],
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const result = document.createElement(name);
  if (className !== undefined) result.className = className;
  return result;
}

function displayName(definition: SymbolDefinition): string {
  return definition.type
    .slice(definition.type.indexOf(".") + 1)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createPropertyList(definition: SymbolDefinition): HTMLDetailsElement {
  const details = element("details", "symbol-properties");
  const summary = element("summary");
  summary.textContent = `${String(definition.editableProperties.length)} editable properties`;
  const list = element("ul");
  for (const property of definition.editableProperties) {
    const item = element("li");
    item.textContent = `${property.key} · ${property.kind}${property.bindable === true ? " · bindable" : ""}`;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

export function mountSymbolGallery(container: HTMLElement): SymbolGalleryController {
  const registry = createIndustrialSymbolRegistry();
  const previews: Preview[] = [];
  const categories = new Map<string, SymbolDefinition[]>();
  for (const definition of registry.getAll()) {
    const definitions = categories.get(definition.category) ?? [];
    definitions.push(definition);
    categories.set(definition.category, definitions);
  }

  for (const [category, definitions] of [...categories].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const section = element("section", "category-section");
    section.dataset.category = category;
    const heading = element("h2");
    heading.textContent = category.replaceAll("-", " ");
    const grid = element("div", "symbol-grid");
    for (const definition of definitions.sort((left, right) =>
      left.type.localeCompare(right.type)
    )) {
      const card = element("article", "symbol-card");
      card.dataset.symbolType = definition.type;
      const cardHeading = element("h3");
      cardHeading.textContent = displayName(definition);
      const canonical = element("code");
      canonical.textContent = definition.type;
      const viewer = element("div", "symbol-preview");
      viewer.setAttribute("aria-label", `${displayName(definition)} preview`);
      const size = element("p", "symbol-size");
      size.textContent = `Default ${String(definition.defaultWidth)}×${String(definition.defaultHeight)} · Min ${String(definition.minimumWidth)}×${String(definition.minimumHeight)}`;
      const ports = element("p", "symbol-ports");
      ports.textContent =
        definition.ports.length === 0
          ? "No ports"
          : `Ports: ${definition.ports.map(({ id }) => id).join(", ")}`;
      card.append(cardHeading, canonical, viewer, size, ports, createPropertyList(definition));
      grid.append(card);

      const preview: Preview = {
        definition,
        defaultDocument: createSymbolPreviewDocument(definition),
        state: "normal",
        renderer: createSvgRenderer({
          symbols: registry,
          options: {
            showGrid: false,
            showPorts: true,
            portVisibility: "always",
            ariaLabel: `${displayName(definition)} symbol`
          },
          runtimeState: {
            getNodeState: () => preview.state
          }
        })
      };
      preview.renderer.mount(viewer);
      preview.renderer.resize({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });
      preview.renderer.renderDocument(preview.defaultDocument);
      previews.push(preview);
    }
    section.append(heading, grid);
    container.append(section);
  }

  return {
    setState(state): void {
      for (const preview of previews) {
        preview.state = preview.definition.supportedStates.includes(state as SymbolState)
          ? (state as SymbolState)
          : "normal";
        preview.renderer.refreshRuntimeStates();
      }
    },
    setMinimumSize(enabled): void {
      for (const preview of previews) {
        const document = createSymbolPreviewDocument(preview.definition, enabled);
        preview.renderer.renderChanges(document, {
          ...createEmptyChangeSet(),
          updatedNodeIds: [document.nodes[0]?.id ?? ""]
        });
      }
    },
    dispose(): void {
      for (const preview of previews) preview.renderer.dispose();
      previews.length = 0;
      container.replaceChildren();
    }
  };
}
