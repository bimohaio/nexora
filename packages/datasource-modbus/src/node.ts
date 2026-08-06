/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/require-await, @typescript-eslint/no-non-null-assertion, @typescript-eslint/prefer-optional-chain -- preserve Node transport callback and validated-buffer behavior */
import net from "node:net";
import { DataSourceError } from "@web-scada/datasource-core";
import type {
  ModbusTcpConnectionConfig,
  ModbusTransport,
  ModbusTransportFactory
} from "./contracts.js";
import { ModbusProtocolError } from "./errors.js";

export const createNodeModbusTcpTransportFactory = (): ModbusTransportFactory => (context) => {
  if (context.connection.transport !== "tcp")
    throw new DataSourceError(
      "DATASOURCE_CONFIGURATION_ERROR",
      "Node TCP factory requires a TCP connection."
    );
  return new NodeModbusTcpTransport(context.connection);
};
class NodeModbusTcpTransport implements ModbusTransport {
  readonly #config: Readonly<ModbusTcpConnectionConfig>;
  #socket: net.Socket | undefined;
  #transaction = 0;
  #buffer = Buffer.alloc(0);
  #pending:
    | {
        id: number;
        resolve: (pdu: Buffer) => void;
        reject: (error: unknown) => void;
        timer: NodeJS.Timeout;
      }
    | undefined;
  constructor(config: Readonly<ModbusTcpConnectionConfig>) {
    this.#config = config;
  }
  connect(signal?: AbortSignal): Promise<void> {
    if (this.#socket && !this.#socket.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: this.#config.host,
        port: this.#config.port ?? 502
      });
      this.#socket = socket;
      socket.setKeepAlive(this.#config.keepAlive ?? true);
      socket.setNoDelay(this.#config.noDelay ?? true);
      const timeout = setTimeout(
        () => socket.destroy(new Error("connect timeout")),
        this.#config.connectTimeoutMs ?? 10_000
      );
      const fail = (cause: unknown) => {
        clearTimeout(timeout);
        reject(connectionError("Modbus TCP connection failed.", cause));
      };
      socket.once("connect", () => {
        clearTimeout(timeout);
        socket.off("error", fail);
        this.#install(socket);
        resolve();
      });
      socket.once("error", fail);
      signal?.addEventListener(
        "abort",
        () => {
          socket.destroy();
          clearTimeout(timeout);
          reject(
            new DataSourceError(
              "DATASOURCE_CONNECTION_ERROR",
              "Modbus TCP connection was cancelled."
            )
          );
        },
        { once: true }
      );
    });
  }
  disconnect(): Promise<void> {
    const socket = this.#socket;
    this.#socket = undefined;
    if (!socket || socket.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      socket.once("close", resolve);
      socket.end();
    });
  }
  async dispose(): Promise<void> {
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.destroy();
    this.#rejectPending(connectionError("Modbus TCP transport was disposed."));
  }
  readCoils(u: number, a: number, q: number): Promise<readonly boolean[]> {
    return this.#readBits(1, u, a, q);
  }
  readDiscreteInputs(u: number, a: number, q: number): Promise<readonly boolean[]> {
    return this.#readBits(2, u, a, q);
  }
  readHoldingRegisters(u: number, a: number, q: number): Promise<readonly number[]> {
    return this.#readRegisters(3, u, a, q);
  }
  readInputRegisters(u: number, a: number, q: number): Promise<readonly number[]> {
    return this.#readRegisters(4, u, a, q);
  }
  async writeSingleCoil(u: number, a: number, value: boolean): Promise<void> {
    await this.#request(u, frame16(5, a, value ? 0xff00 : 0));
  }
  async writeMultipleCoils(u: number, a: number, values: readonly boolean[]): Promise<void> {
    const byteCount = Math.ceil(values.length / 8),
      pdu = Buffer.alloc(6 + byteCount);
    pdu[0] = 15;
    pdu.writeUInt16BE(a, 1);
    pdu.writeUInt16BE(values.length, 3);
    pdu[5] = byteCount;
    values.forEach((value, index) => {
      if (value) pdu[6 + (index >> 3)]! |= 1 << (index & 7);
    });
    await this.#request(u, pdu);
  }
  async writeSingleRegister(u: number, a: number, value: number): Promise<void> {
    await this.#request(u, frame16(6, a, value));
  }
  async writeMultipleRegisters(u: number, a: number, values: readonly number[]): Promise<void> {
    const pdu = Buffer.alloc(6 + values.length * 2);
    pdu[0] = 16;
    pdu.writeUInt16BE(a, 1);
    pdu.writeUInt16BE(values.length, 3);
    pdu[5] = values.length * 2;
    values.forEach((value, index) => pdu.writeUInt16BE(value, 6 + index * 2));
    await this.#request(u, pdu);
  }
  async #readBits(
    code: number,
    unit: number,
    address: number,
    quantity: number
  ): Promise<readonly boolean[]> {
    const pdu = await this.#request(unit, frame16(code, address, quantity)),
      result: boolean[] = [];
    if (pdu[1] !== Math.ceil(quantity / 8)) throw parseError("Invalid Modbus bit response length.");
    for (let index = 0; index < quantity; index++)
      result.push(((pdu[2 + (index >> 3)]! >> (index & 7)) & 1) === 1);
    return Object.freeze(result);
  }
  async #readRegisters(
    code: number,
    unit: number,
    address: number,
    quantity: number
  ): Promise<readonly number[]> {
    const pdu = await this.#request(unit, frame16(code, address, quantity));
    if (pdu[1] !== quantity * 2 || pdu.length !== quantity * 2 + 2)
      throw parseError("Invalid Modbus register response length.");
    const result: number[] = [];
    for (let index = 0; index < quantity; index++) result.push(pdu.readUInt16BE(2 + index * 2));
    return Object.freeze(result);
  }
  #request(unit: number, pdu: Buffer): Promise<Buffer> {
    const socket = this.#socket;
    if (!socket || socket.destroyed || !socket.writable)
      return Promise.reject(connectionError("Modbus TCP socket is not connected."));
    if (this.#pending)
      return Promise.reject(
        new DataSourceError(
          "DATASOURCE_INTERNAL_ERROR",
          "Modbus TCP transport received overlapping requests."
        )
      );
    const id = (this.#transaction = (this.#transaction + 1) & 0xffff),
      packet = Buffer.alloc(7 + pdu.length);
    packet.writeUInt16BE(id, 0);
    packet.writeUInt16BE(0, 2);
    packet.writeUInt16BE(pdu.length + 1, 4);
    packet[6] = unit;
    pdu.copy(packet, 7);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending = undefined;
        reject(
          new DataSourceError("DATASOURCE_TIMEOUT", "Modbus request timed out.", {
            recoverable: true
          })
        );
      }, this.#config.requestTimeoutMs ?? 5_000);
      this.#pending = { id, resolve, reject, timer };
      socket.write(packet, (error) => {
        if (error) this.#rejectPending(connectionError("Modbus TCP write failed.", error));
      });
    });
  }
  #install(socket: net.Socket): void {
    socket.on("data", (chunk) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      this.#consume();
    });
    socket.on("error", (cause) => {
      this.#rejectPending(connectionError("Modbus TCP socket error.", cause));
    });
    socket.on("close", () => {
      this.#rejectPending(connectionError("Modbus TCP socket closed.", undefined, true));
    });
  }
  #consume(): void {
    while (this.#buffer.length >= 7) {
      const length = this.#buffer.readUInt16BE(4),
        total = 6 + length;
      if (this.#buffer.length < total) return;
      const packet = this.#buffer.subarray(0, total);
      this.#buffer = this.#buffer.subarray(total);
      const pending = this.#pending;
      if (!pending || packet.readUInt16BE(0) !== pending.id) continue;
      this.#pending = undefined;
      clearTimeout(pending.timer);
      const pdu = packet.subarray(7);
      if ((pdu[0]! & 0x80) !== 0) pending.reject(new ModbusProtocolError(pdu[1] ?? 0));
      else pending.resolve(pdu);
    }
  }
  #rejectPending(error: unknown): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}
function frame16(code: number, first: number, second: number): Buffer {
  const pdu = Buffer.alloc(5);
  pdu[0] = code;
  pdu.writeUInt16BE(first, 1);
  pdu.writeUInt16BE(second, 3);
  return pdu;
}
function connectionError(message: string, cause?: unknown, recoverable = true): DataSourceError {
  return new DataSourceError("DATASOURCE_CONNECTION_ERROR", message, { recoverable, cause });
}
function parseError(message: string): DataSourceError {
  return new DataSourceError("DATASOURCE_PARSE_ERROR", message);
}
