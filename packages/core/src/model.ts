export const SCADA_SCHEMA_VERSION = "1.0.0" as const;

export type IsoDateTime = string;
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type Rotation = 0 | 90 | 180 | 270;
export type ConnectionRouting = "direct" | "orthogonal" | "manual";
export type PortDirection = "input" | "output" | "bidirectional" | "passive";
export type ConnectionDirection = "forward" | "reverse" | "bidirectional" | "none";
export type Medium =
  | "water"
  | "gas"
  | "oil"
  | "air"
  | "steam"
  | "electricity"
  | "signal"
  | "network"
  | "generic"
  | (string & {});

export interface DocumentMetadata {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly createdBy?: string;
  readonly tags: readonly string[];
  readonly projectVersion?: string;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CanvasModel {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly gridSize: number;
  readonly gridVisible: boolean;
  readonly snapToGrid: boolean;
  readonly coordinateUnit: string;
  readonly defaultViewport: Viewport;
}

export interface NodeTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface ScadaNode {
  readonly id: string;
  readonly name: string;
  readonly symbolType: string;
  readonly transform: NodeTransform;
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly bindings: readonly string[];
  readonly layerId: string;
  readonly parentId?: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface ConnectionEndpoint {
  readonly nodeId: string;
  readonly portId: string;
}

export interface Waypoint {
  readonly x: number;
  readonly y: number;
}

export interface ConnectionStyle {
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly dashArray?: readonly number[];
}

export interface ScadaConnection {
  readonly id: string;
  readonly name: string;
  readonly source: ConnectionEndpoint;
  readonly target: ConnectionEndpoint;
  readonly routing: ConnectionRouting;
  readonly waypoints: readonly Waypoint[];
  readonly medium: Medium;
  readonly direction: ConnectionDirection;
  readonly style: ConnectionStyle;
  readonly layerId: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface ScadaLayer {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface ScadaGroup {
  readonly id: string;
  readonly parentId?: string;
  readonly childNodeIds: readonly string[];
}

export type VariableDataType = "boolean" | "number" | "string";

export interface DocumentVariable {
  readonly id: string;
  readonly name: string;
  readonly dataType: VariableDataType;
  readonly defaultValue?: JsonPrimitive;
  readonly description?: string;
}

export interface BindingFormatter {
  readonly type: string;
  readonly options?: Readonly<Record<string, JsonValue>>;
}

export interface BindingTransformation {
  readonly type: string;
  readonly options?: Readonly<Record<string, JsonValue>>;
}

export interface PropertyBinding {
  readonly id: string;
  readonly nodeId: string;
  readonly property: string;
  readonly tagId: string;
  readonly formatter?: BindingFormatter;
  readonly transformation?: BindingTransformation;
}

export interface RuntimeSettings {
  readonly updateIntervalMs: number;
  readonly staleAfterMs?: number;
}

export interface ScadaDocument {
  readonly schemaVersion: typeof SCADA_SCHEMA_VERSION;
  readonly id: string;
  readonly metadata: DocumentMetadata;
  readonly canvas: CanvasModel;
  readonly layers: readonly ScadaLayer[];
  readonly nodes: readonly ScadaNode[];
  readonly connections: readonly ScadaConnection[];
  readonly variables: readonly DocumentVariable[];
  readonly bindings: readonly PropertyBinding[];
  readonly runtimeSettings: RuntimeSettings;
}
