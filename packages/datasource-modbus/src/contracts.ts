import type { JsonValue } from "@web-scada/core";
import type {
  DataSourceAdapter,
  DataSourceIdentity,
  DataSourceMetadata,
  DataSourceScheduler,
  ReconnectPolicy
} from "@web-scada/datasource-core";

export type ModbusDataArea = "coil" | "discrete-input" | "input-register" | "holding-register";
export type ModbusDataType =
  | "boolean"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "uint64"
  | "int64"
  | "float32"
  | "float64"
  | "bitfield16"
  | "string"
  | "registers";
export type ModbusByteOrder = "big-endian" | "little-endian";
export type ModbusWordOrder = "high-word-first" | "low-word-first";
export type ModbusIntegerRounding = "reject-fraction" | "round" | "floor" | "ceil" | "truncate";

export interface ModbusPointAddress {
  readonly area: ModbusDataArea;
  /** Zero-based protocol address. */
  readonly address: number;
  readonly unitId?: number;
  readonly quantity?: number;
}
export interface ModbusPointDefinition {
  readonly id: string;
  readonly address: Readonly<ModbusPointAddress>;
  readonly dataType: ModbusDataType;
  readonly byteOrder?: ModbusByteOrder;
  readonly wordOrder?: ModbusWordOrder;
  readonly scale?: number;
  readonly offset?: number;
  readonly bitIndex?: number;
  readonly stringLength?: number;
  readonly stringEncoding?: "ascii" | "utf-8";
  readonly nullTerminated?: boolean;
  readonly trim?: boolean;
  readonly pollIntervalMs?: number;
  readonly deadband?: number;
  readonly writable?: boolean;
  readonly integerRounding?: ModbusIntegerRounding;
  readonly metadata?: DataSourceMetadata;
}
export interface ModbusTcpConnectionConfig {
  readonly transport: "tcp";
  readonly host: string;
  readonly port?: number;
  readonly unitId?: number;
  readonly connectTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly keepAlive?: boolean;
  readonly noDelay?: boolean;
  /** Non-secret application lookup key. */
  readonly connectionRef?: string;
}
export interface ModbusCustomConnectionConfig {
  readonly transport: "custom";
  readonly unitId?: number;
  readonly requestTimeoutMs?: number;
  readonly connectionRef?: string;
}
export type ModbusConnectionConfig = ModbusTcpConnectionConfig | ModbusCustomConnectionConfig;
export interface ModbusProtocolLimits {
  readonly maxCoilsPerRead?: number;
  readonly maxRegistersPerRead?: number;
  readonly maxRegistersPerWrite?: number;
}
export interface ModbusPollingConfig {
  readonly intervalMs?: number;
  readonly mergeGap?: number;
}
export interface ModbusWritePolicy {
  readonly enabled: boolean;
  readonly verification?: "none" | "exact-match" | "tolerance";
  readonly tolerance?: number;
}
export interface ModbusAdapterConfig {
  readonly identity: DataSourceIdentity;
  readonly connection: Readonly<ModbusConnectionConfig>;
  readonly points: readonly Readonly<ModbusPointDefinition>[];
  readonly polling?: Readonly<ModbusPollingConfig>;
  readonly limits?: Readonly<ModbusProtocolLimits>;
  readonly writes?: Readonly<ModbusWritePolicy>;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly scheduler?: DataSourceScheduler;
  readonly transportFactory?: ModbusTransportFactory;
}
export interface ModbusTransportFactoryContext {
  readonly adapterId: string;
  readonly connection: Readonly<ModbusConnectionConfig>;
  readonly connectionRef?: string;
}
export interface ModbusTransport {
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  readCoils(unitId: number, address: number, quantity: number): Promise<readonly boolean[]>;
  readDiscreteInputs(
    unitId: number,
    address: number,
    quantity: number
  ): Promise<readonly boolean[]>;
  readHoldingRegisters(
    unitId: number,
    address: number,
    quantity: number
  ): Promise<readonly number[]>;
  readInputRegisters(unitId: number, address: number, quantity: number): Promise<readonly number[]>;
  writeSingleCoil?(unitId: number, address: number, value: boolean): Promise<void>;
  writeMultipleCoils?(unitId: number, address: number, values: readonly boolean[]): Promise<void>;
  writeSingleRegister?(unitId: number, address: number, value: number): Promise<void>;
  writeMultipleRegisters?(
    unitId: number,
    address: number,
    values: readonly number[]
  ): Promise<void>;
  dispose(): Promise<void>;
}
export type ModbusTransportFactory = (
  context: Readonly<ModbusTransportFactoryContext>
) => ModbusTransport | Promise<ModbusTransport>;
export interface ModbusDiagnosticsSnapshot {
  readonly activeGroups: number;
  readonly pointCount: number;
  readonly completedReads: number;
  readonly failedReads: number;
  readonly missedCycles: number;
  readonly lastSuccessfulRead?: number;
  readonly lastFailure?: number;
}
export interface ModbusDataSource extends DataSourceAdapter {
  getDiagnostics(): Readonly<ModbusDiagnosticsSnapshot>;
}
export interface ModbusProtocolErrorDetails {
  readonly exceptionCode: number;
  readonly category: string;
  readonly recoverable: boolean;
  readonly context?: Readonly<Record<string, JsonValue>>;
}
