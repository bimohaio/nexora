import type { JsonValue } from "@web-scada/core";
import type {
  DataPointAddress,
  DataQuality,
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceMetadata,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";
import type { SimulatorGeneratorDefinition } from "./generators.js";

export type SimulatorDataType = "number" | "boolean" | "string";
export type SimulatorWritePolicy = "manual-only" | "writable-points";

export interface SimulatorPointDefinition {
  readonly address: DataPointAddress;
  readonly dataType: SimulatorDataType;
  readonly initialValue: JsonValue;
  readonly generator: SimulatorGeneratorDefinition;
  readonly updateIntervalMs?: number;
  readonly readable?: boolean;
  readonly writable?: boolean;
  readonly quality?: DataQuality;
  readonly metadata?: DataSourceMetadata;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly unit?: string;
  readonly displayName?: string;
  readonly seed?: number;
}

export interface SimulatorDataSourceConfig {
  readonly identity: DataSourceIdentity;
  readonly points: readonly SimulatorPointDefinition[];
  readonly scheduler?: DataSourceScheduler;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly connectionDelayMs?: number;
  readonly connectionFailures?: number;
  readonly writePolicy?: SimulatorWritePolicy;
  readonly seed?: number;
  readonly emitInitialValue?: boolean;
}

export interface SimulatorPointSnapshot {
  readonly address: DataPointAddress;
  readonly value: JsonValue;
  readonly quality: DataQuality;
  readonly sequence: number;
  readonly sourceTimestamp: number;
}

export interface SimulatorControl {
  pause(): void;
  resume(): void;
  reset(): void;
  failNextConnections(count?: number): void;
  simulateConnectionLoss(error?: unknown): void;
  setQuality(address: DataPointAddress, quality: DataQuality): void;
  getPoint(address: DataPointAddress): Readonly<SimulatorPointSnapshot> | undefined;
}

export interface SimulatorDataSource extends DataSourceAdapter {
  readonly control: SimulatorControl;
}
