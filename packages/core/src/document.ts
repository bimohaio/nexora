import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import type { EntityIdGenerator } from "./ids.js";
import { UlidEntityIdGenerator } from "./ids.js";
import {
  SCADA_SCHEMA_VERSION,
  type CanvasModel,
  type RuntimeSettings,
  type ScadaDocument
} from "./model.js";

export const DEFAULT_CANVAS: CanvasModel = {
  width: 1920,
  height: 1080,
  background: "transparent",
  gridSize: 10,
  gridVisible: true,
  snapToGrid: true,
  coordinateUnit: "logical",
  defaultViewport: { x: 0, y: 0, zoom: 1 }
};

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  refreshInterval: 250,
  staleAfterMs: 5000,
  defaultQuality: "unknown"
};

export interface CreateDocumentOptions {
  readonly name: string;
  readonly description?: string;
  readonly createdBy?: string;
  readonly tags?: readonly string[];
  readonly projectVersion?: string;
  readonly canvas?: Partial<CanvasModel>;
  readonly runtimeSettings?: Partial<RuntimeSettings>;
  readonly idGenerator?: EntityIdGenerator;
  readonly clock?: Clock;
}

export function createScadaDocument(options: CreateDocumentOptions): ScadaDocument {
  const ids = options.idGenerator ?? new UlidEntityIdGenerator();
  const clock = options.clock ?? new SystemClock();
  const now = clock.now();
  const documentId = ids.createDocumentId();
  const defaultLayerId = ids.createLayerId();
  return normalizeDocument({
    schemaVersion: SCADA_SCHEMA_VERSION,
    id: documentId,
    metadata: {
      name: options.name,
      ...(options.description === undefined ? {} : { description: options.description }),
      createdAt: now,
      updatedAt: now,
      ...(options.createdBy === undefined ? {} : { createdBy: options.createdBy }),
      tags: options.tags ?? [],
      ...(options.projectVersion === undefined ? {} : { projectVersion: options.projectVersion })
    },
    canvas: {
      ...DEFAULT_CANVAS,
      ...options.canvas,
      defaultViewport: {
        ...DEFAULT_CANVAS.defaultViewport,
        ...options.canvas?.defaultViewport
      }
    },
    layers: [{ id: defaultLayerId, name: "Default", order: 0, visible: true, locked: false }],
    nodes: [],
    connections: [],
    variables: [],
    bindings: [],
    runtimeSettings: { ...DEFAULT_RUNTIME_SETTINGS, ...options.runtimeSettings }
  });
}

function uniqueTrimmed(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeDocument(document: ScadaDocument): ScadaDocument {
  const layers = [...document.layers]
    .map((layer, inputOrder) => ({ layer, inputOrder }))
    .sort((a, b) => a.layer.order - b.layer.order || a.inputOrder - b.inputOrder)
    .map(({ layer }, order) => ({ ...layer, name: layer.name.trim(), order }));
  return {
    ...document,
    metadata: {
      ...document.metadata,
      name: document.metadata.name.trim(),
      tags: uniqueTrimmed(document.metadata.tags),
      ...(document.metadata.description === undefined
        ? {}
        : { description: document.metadata.description.trim() })
    },
    canvas: {
      ...DEFAULT_CANVAS,
      ...document.canvas,
      defaultViewport: { ...DEFAULT_CANVAS.defaultViewport, ...document.canvas.defaultViewport }
    },
    layers,
    nodes: document.nodes.map((node) => ({
      ...node,
      name: node.name.trim(),
      symbolType: node.symbolType.trim(),
      transform: {
        ...node.transform,
        rotation: ((node.transform.rotation % 360) + 360) % 360
      }
    })),
    connections: document.connections.map((connection) => ({
      ...connection,
      name: connection.name.trim(),
      waypoints: connection.waypoints,
      style: connection.style
    })),
    variables: document.variables.map((variable) => ({
      ...variable,
      name: variable.name.trim(),
      readonly: variable.readonly
    })),
    bindings: document.bindings.map((binding) => ({
      ...binding,
      mode: "one-way",
      enabled: binding.enabled
    })),
    runtimeSettings: { ...DEFAULT_RUNTIME_SETTINGS, ...document.runtimeSettings }
  };
}
