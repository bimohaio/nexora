export const SCADA_SCHEMA_VERSION = "1.0.0" as const;

export type IsoDateTime = string;
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type ExtensionData = Readonly<Record<string, JsonValue>>;

export type Rotation = number;
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
  readonly metadata?: ExtensionData;
  readonly extensions?: ExtensionData;
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
  readonly opacity?: number;
  readonly dashPattern?: readonly number[];
  readonly lineCap?: "butt" | "round" | "square";
  readonly lineJoin?: "miter" | "round" | "bevel";
  readonly startMarker?: "none" | "arrow" | "circle" | "diamond";
  readonly endMarker?: "none" | "arrow" | "circle" | "diamond";
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
  readonly metadata?: ExtensionData;
  readonly extensions?: ExtensionData;
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

export type VariableDataType =
  "boolean" | "integer" | "number" | "string" | "color" | "date-time" | "json";

export interface DocumentVariable {
  readonly id: string;
  readonly name: string;
  readonly dataType: VariableDataType;
  readonly defaultValue?: JsonValue;
  readonly value?: JsonValue;
  readonly unit?: string;
  readonly description?: string;
  readonly readonly: boolean;
}

export type BindingSource =
  | { readonly type: "tag"; readonly tagId: string }
  | { readonly type: "variable"; readonly variableId: string }
  | { readonly type: "constant"; readonly value: JsonValue }
  | {
      readonly type: "expression";
      readonly expression: string;
      readonly language?: "scada-expression-v1" | (string & {});
    };

export type BindingTarget =
  | { readonly type: "node-property"; readonly nodeId: string; readonly property: string }
  | { readonly type: "node-state"; readonly nodeId: string }
  | {
      readonly type: "connection-property";
      readonly connectionId: string;
      readonly property: string;
    }
  | { readonly type: "visibility"; readonly entityId: string }
  | { readonly type: "text"; readonly nodeId: string };

export interface BindingFormatter {
  readonly type: string;
  readonly options?: ExtensionData;
}

export interface BindingTransformation {
  readonly type: string;
  readonly options?: ExtensionData;
}

export interface PropertyBinding {
  readonly id: string;
  readonly source: BindingSource;
  readonly target: BindingTarget;
  readonly mode: "one-way";
  readonly formatter?: BindingFormatter;
  readonly transformation?: BindingTransformation;
  readonly fallback?: JsonValue;
  readonly enabled: boolean;
  readonly extensions?: ExtensionData;
}

export interface RuntimeSettings {
  readonly refreshInterval: number;
  readonly staleAfterMs?: number;
  readonly defaultQuality: "good" | "uncertain" | "bad" | "offline" | "unknown";
  readonly timezone?: string;
  readonly locale?: string;
}

export interface ScadaDocument {
  readonly schemaVersion: string;
  readonly id: string;
  readonly metadata: DocumentMetadata;
  readonly canvas: CanvasModel;
  readonly layers: readonly ScadaLayer[];
  readonly nodes: readonly ScadaNode[];
  readonly connections: readonly ScadaConnection[];
  readonly variables: readonly DocumentVariable[];
  readonly bindings: readonly PropertyBinding[];
  readonly runtimeSettings: RuntimeSettings;
  readonly extensions?: ExtensionData;
}
