import { DataSourceError } from "@web-scada/datasource-core";
import type { ModbusTransport, ModbusTransportFactory } from "./contracts.js";

export class MockModbusTransport implements ModbusTransport {
  readonly coils = new Map<number, boolean>();
  readonly discreteInputs = new Map<number, boolean>();
  readonly holdingRegisters = new Map<number, number>();
  readonly inputRegisters = new Map<number, number>();
  connected = false;
  disposed = false;
  requestCount = 0;
  failNext: unknown;
  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
  dispose(): Promise<void> {
    this.connected = false;
    this.disposed = true;
    return Promise.resolve();
  }
  readCoils(_u: number, a: number, q: number): Promise<readonly boolean[]> {
    return this.#read(this.coils, a, q, false);
  }
  readDiscreteInputs(_u: number, a: number, q: number): Promise<readonly boolean[]> {
    return this.#read(this.discreteInputs, a, q, false);
  }
  readHoldingRegisters(_u: number, a: number, q: number): Promise<readonly number[]> {
    return this.#read(this.holdingRegisters, a, q, 0);
  }
  readInputRegisters(_u: number, a: number, q: number): Promise<readonly number[]> {
    return this.#read(this.inputRegisters, a, q, 0);
  }
  writeSingleCoil(_u: number, a: number, value: boolean): Promise<void> {
    return this.#write(this.coils, a, [value]);
  }
  writeMultipleCoils(_u: number, a: number, values: readonly boolean[]): Promise<void> {
    return this.#write(this.coils, a, values);
  }
  writeSingleRegister(_u: number, a: number, value: number): Promise<void> {
    return this.#write(this.holdingRegisters, a, [value]);
  }
  writeMultipleRegisters(_u: number, a: number, values: readonly number[]): Promise<void> {
    return this.#write(this.holdingRegisters, a, values);
  }
  async #read<T>(
    map: Map<number, T>,
    address: number,
    quantity: number,
    fallback: T
  ): Promise<readonly T[]> {
    this.#before();
    return Object.freeze(
      Array.from({ length: quantity }, (_, index) => map.get(address + index) ?? fallback)
    );
  }
  async #write<T>(map: Map<number, T>, address: number, values: readonly T[]): Promise<void> {
    this.#before();
    values.forEach((value, index) => map.set(address + index, value));
  }
  #before(): void {
    if (!this.connected)
      throw new DataSourceError(
        "DATASOURCE_NOT_CONNECTED",
        "Mock Modbus transport is disconnected."
      );
    this.requestCount++;
    if (this.failNext !== undefined) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
  }
}
export function createMockModbusTransportFactory(transport = new MockModbusTransport()): {
  transport: MockModbusTransport;
  factory: ModbusTransportFactory;
} {
  return { transport, factory: () => transport };
}
