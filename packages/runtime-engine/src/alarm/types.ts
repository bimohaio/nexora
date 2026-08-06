import type { JsonValue } from "@web-scada/core";
import type { DataQuality, RuntimeTaskScheduler } from "../contracts.js";

export type AlarmLifecycle = "NORMAL" | "ACTIVE_UNACK" | "ACTIVE_ACK" | "RETURNED_UNACK";
export type AlarmStatus =
  | "Normal"
  | "Active"
  | "Acknowledged"
  | "Shelved"
  | "Disabled"
  | "Suppressed"
  | "Unknown"
  | "Offline"
  | "OutOfService"
  | "Maintenance";
export type AlarmSeverity =
  "none" | "info" | "low" | "medium" | "high" | "critical" | "emergency" | (string & {});
export type AlarmSourceKind =
  | "threshold"
  | "boolean"
  | "expression"
  | "manual"
  | "external-plc"
  | "mqtt"
  | "opc-ua"
  | "simulator"
  | (string & {});
export type AlarmCategory =
  | "process"
  | "electrical"
  | "safety"
  | "communication"
  | "device"
  | "security"
  | "diagnostic"
  | "custom"
  | (string & {});
export type AlarmReason =
  "condition-active" | "condition-returned" | "quality" | "manual" | "external" | (string & {});
export type AlarmOverlayPolicy = "none" | "badge" | "border" | "icon" | "pattern" | (string & {});

export interface AlarmSeverityDefinition {
  readonly id: AlarmSeverity;
  readonly priority: number;
  readonly displayName: string;
  readonly colorToken: string;
  readonly blink: boolean;
  readonly flash: boolean;
  readonly overlay: AlarmOverlayPolicy;
  readonly soundCapable: boolean;
}

export interface AlarmSource {
  readonly kind: AlarmSourceKind;
  readonly sourceId: string;
  readonly priority?: number;
}

export interface RuntimeAlarm {
  readonly alarmId: string;
  readonly symbolId: string;
  readonly connectionId?: string;
  readonly groupId?: string;
  readonly layerId?: string;
  readonly sourceId: string;
  readonly sourceKind: AlarmSourceKind;
  readonly sourcePriority: number;
  readonly category: AlarmCategory;
  readonly severity: AlarmSeverity;
  readonly priority: number;
  readonly timestamp: number;
  readonly status: AlarmStatus;
  readonly lifecycle: AlarmLifecycle;
  readonly message: string;
  readonly code: string;
  readonly origin: string;
  readonly reason: AlarmReason;
  readonly quality: DataQuality;
  readonly requiresAcknowledgement: boolean;
  readonly acknowledged: boolean;
  readonly pendingAcknowledgement: boolean;
  readonly returnedWhileAcknowledged: boolean;
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly revision: number;
}

export interface AlarmInput extends Omit<
  RuntimeAlarm,
  | "lifecycle"
  | "sourcePriority"
  | "priority"
  | "quality"
  | "requiresAcknowledgement"
  | "acknowledged"
  | "pendingAcknowledgement"
  | "returnedWhileAcknowledged"
  | "metadata"
  | "revision"
> {
  readonly sourcePriority?: number;
  readonly priority?: number;
  readonly quality?: DataQuality;
  readonly requiresAcknowledgement?: boolean;
  readonly acknowledged?: boolean;
  readonly pendingAcknowledgement?: boolean;
  readonly returnedWhileAcknowledged?: boolean;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly revision?: number;
}

export interface AlarmVisualState {
  readonly blink: boolean;
  readonly flash: boolean;
  readonly badge: boolean;
  readonly overlay: AlarmOverlayPolicy;
  readonly borderEmphasis: boolean;
  readonly opacityOverride?: number;
  readonly icon?: string;
  readonly priorityToken: string;
}

export interface ResolvedAlarm {
  readonly effectiveAlarm?: RuntimeAlarm;
  readonly effectiveSeverity: AlarmSeverity;
  readonly effectiveStatus: AlarmStatus;
  readonly alarmCount: number;
  readonly ackRequired: boolean;
  readonly visual: AlarmVisualState;
}

export type AlarmScopeKind = "symbol" | "connection" | "group" | "layer" | "document";
export interface AlarmAggregate extends ResolvedAlarm {
  readonly scope: AlarmScopeKind;
  readonly scopeId: string;
  readonly alarmIds: readonly string[];
}

export interface AlarmSnapshot {
  readonly revision: number;
  readonly timestamp: number;
  readonly alarms: ReadonlyMap<string, RuntimeAlarm>;
  readonly symbols: ReadonlyMap<string, AlarmAggregate>;
  readonly connections: ReadonlyMap<string, AlarmAggregate>;
  readonly groups: ReadonlyMap<string, AlarmAggregate>;
  readonly layers: ReadonlyMap<string, AlarmAggregate>;
  readonly document: AlarmAggregate;
}

export type AlarmChangeKind =
  "activated" | "updated" | "severity-changed" | "acknowledged" | "cleared" | "timestamp-changed";
export interface AlarmChange {
  readonly alarmId: string;
  readonly kind: AlarmChangeKind;
  readonly previous?: RuntimeAlarm;
  readonly current?: RuntimeAlarm;
}
export interface AlarmSnapshotDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changes: readonly AlarmChange[];
  readonly changedSymbolIds: readonly string[];
  readonly changedConnectionIds: readonly string[];
  readonly changedGroupIds: readonly string[];
  readonly changedLayerIds: readonly string[];
  readonly documentChanged: boolean;
}
export interface AlarmEvaluationResult {
  readonly changed: boolean;
  readonly snapshot: AlarmSnapshot;
  readonly diff?: AlarmSnapshotDiff;
}

export type AlarmEvent =
  | { readonly type: "AlarmActivated"; readonly alarm: RuntimeAlarm }
  | { readonly type: "AlarmCleared"; readonly alarm: RuntimeAlarm }
  | {
      readonly type: "SeverityChanged";
      readonly alarm: RuntimeAlarm;
      readonly previousSeverity: AlarmSeverity;
    }
  | { readonly type: "Acknowledged"; readonly alarm: RuntimeAlarm }
  | { readonly type: "Shelved"; readonly alarm: RuntimeAlarm }
  | { readonly type: "Suppressed"; readonly alarm: RuntimeAlarm }
  | { readonly type: "AlarmReturned"; readonly alarm: RuntimeAlarm };

export interface AlarmEngineOptions {
  readonly severities?: readonly AlarmSeverityDefinition[];
  readonly scheduler?: RuntimeTaskScheduler;
  readonly now?: () => number;
  readonly onEvent?: (event: AlarmEvent) => void;
}
