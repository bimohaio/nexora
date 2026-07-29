import { createEmptyChangeSet, type ScadaDocument, type ScadaNode } from "@web-scada/core";
import { createSvgRenderer, type SvgRenderer } from "@web-scada/renderer-svg";
import {
  createIndustrialSymbolRegistry,
  createStandardSymbolCategoryRegistry,
  type SymbolDefinition,
  type SymbolState
} from "@web-scada/symbols";

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 170;

export interface SymbolGalleryController {
  setState(state: string): void;
  setMinimumSize(enabled: boolean): void;
  setSearch(query: string): void;
  setCategory(category: string): void;
  setVariant(variant: string): void;
  setRotation(rotation: number): void;
  setTheme(theme: "dark" | "light"): void;
  dispose(): void;
}

interface Preview {
  readonly definition: SymbolDefinition;
  readonly card: HTMLElement;
  readonly viewer: HTMLElement;
  readonly defaultDocument: ScadaDocument;
  renderer?: SvgRenderer;
  state: SymbolState;
}

function previewNode(
  definition: SymbolDefinition,
  useMinimumSize: boolean,
  variant = definition.variants?.[0]?.id,
  rotation = 0
): ScadaNode {
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
      rotation,
      scaleX: 1,
      scaleY: 1
    },
    properties: {
      labelVisible: false,
      ...Object.fromEntries(
        definition.editableProperties
          .filter(({ defaultValue }) => defaultValue !== undefined)
          .map(({ key, defaultValue }) => [key, defaultValue])
      ),
      ...(variant === undefined ? {} : { variant })
    },
    bindings: [],
    layerId: "preview",
    visible: true,
    locked: false
  };
}

export function createSymbolPreviewDocument(
  definition: SymbolDefinition,
  useMinimumSize = false,
  variant?: string,
  rotation = 0
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
    nodes: [previewNode(definition, useMinimumSize, variant, rotation)],
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
  const categoryRegistry = createStandardSymbolCategoryRegistry();
  const previews: Preview[] = [];
  const categories = new Map<string, SymbolDefinition[]>();
  for (const definition of registry.getAll()) {
    const definitions = categories.get(definition.category) ?? [];
    definitions.push(definition);
    categories.set(definition.category, definitions);
  }

  const categoryOrder = new Map(
    categoryRegistry.list().map(({ id }, index) => [id, index] as const)
  );
  for (const [category, definitions] of [...categories].sort(
    ([left], [right]) =>
      (categoryOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)
  )) {
    const section = element("section", "category-section");
    section.dataset.category = category;
    const heading = element("h2");
    heading.textContent =
      categoryRegistry.get(category)?.displayName ?? category.replaceAll("-", " ");
    const grid = element("div", "symbol-grid");
    for (const definition of definitions.sort((left, right) =>
      left.type.localeCompare(right.type)
    )) {
      const card = element("article", "symbol-card");
      card.dataset.symbolType = definition.type;
      card.dataset.search = [
        definition.type,
        displayName(definition),
        definition.descriptionKey ?? "",
        ...(definition.tags ?? [])
      ]
        .join(" ")
        .toLocaleLowerCase();
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
        card,
        viewer,
        defaultDocument: createSymbolPreviewDocument(definition),
        state: "normal"
      };
      previews.push(preview);
    }
    section.append(heading, grid);
    container.append(section);
  }

  const activate = (preview: Preview): void => {
    if (preview.renderer !== undefined) return;
    preview.renderer = createSvgRenderer({
      symbols: registry,
      options: {
        showGrid: false,
        showPorts: true,
        portVisibility: "always",
        ariaLabel: `${displayName(preview.definition)} symbol`
      },
      runtimeState: {
        getNodeState: () => preview.state
      }
    });
    preview.renderer.mount(preview.viewer);
    preview.renderer.resize({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });
    preview.renderer.renderDocument(preview.defaultDocument);
  };
  const observer =
    typeof IntersectionObserver === "undefined" ||
    !IntersectionObserver.toString().includes("[native code]")
      ? undefined
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              if (entry.isIntersecting) {
                const preview = previews.find(({ viewer }) => viewer === entry.target);
                if (preview !== undefined) activate(preview);
                observer?.unobserve(entry.target);
              }
          },
          { rootMargin: "300px" }
        );
  for (const preview of previews) {
    if (observer === undefined) activate(preview);
    else observer.observe(preview.viewer);
  }

  let minimumSize = false;
  let variant = "horizontal";
  let rotation = 0;
  let search = "";
  let category = "";
  const updateFilter = (): void => {
    for (const preview of previews)
      preview.card.hidden =
        (category !== "" && preview.definition.category !== category) ||
        (search !== "" && !preview.card.dataset.search?.includes(search));
    for (const section of container.querySelectorAll<HTMLElement>(".category-section"))
      section.hidden = [...section.querySelectorAll<HTMLElement>(".symbol-card")].every(
        (card) => card.hidden
      );
  };
  const rerender = (): void => {
    for (const preview of previews) {
      if (preview.renderer === undefined) continue;
      const supportedVariant = preview.definition.variants?.some(({ id }) => id === variant)
        ? variant
        : preview.definition.variants?.[0]?.id;
      const document = createSymbolPreviewDocument(
        preview.definition,
        minimumSize,
        supportedVariant,
        rotation
      );
      preview.renderer.renderChanges(document, {
        ...createEmptyChangeSet(),
        updatedNodeIds: [document.nodes[0]?.id ?? ""]
      });
    }
  };

  return {
    setState(state): void {
      for (const preview of previews) {
        preview.state = preview.definition.supportedStates.includes(state as SymbolState)
          ? (state as SymbolState)
          : "normal";
        preview.renderer?.refreshRuntimeStates();
      }
    },
    setMinimumSize(enabled): void {
      minimumSize = enabled;
      rerender();
    },
    setSearch(query): void {
      search = query.trim().toLocaleLowerCase();
      updateFilter();
    },
    setCategory(value): void {
      category = value;
      updateFilter();
    },
    setVariant(value): void {
      variant = value;
      rerender();
    },
    setRotation(value): void {
      rotation = Number.isFinite(value) ? value : 0;
      rerender();
    },
    setTheme(theme): void {
      document.documentElement.dataset.theme = theme;
    },
    dispose(): void {
      observer?.disconnect();
      for (const preview of previews) preview.renderer?.dispose();
      previews.length = 0;
      container.replaceChildren();
    }
  };
}
