import { DataSourceError } from "@web-scada/datasource-core";

const EXCEPTIONS: Readonly<Record<number, [string, boolean]>> = Object.freeze({
  1: ["ILLEGAL_FUNCTION", false],
  2: ["ILLEGAL_DATA_ADDRESS", false],
  3: ["ILLEGAL_DATA_VALUE", false],
  4: ["SERVER_DEVICE_FAILURE", true],
  5: ["ACKNOWLEDGE", true],
  6: ["SERVER_DEVICE_BUSY", true],
  8: ["MEMORY_PARITY_ERROR", true],
  10: ["GATEWAY_PATH_UNAVAILABLE", true],
  11: ["GATEWAY_TARGET_NO_RESPONSE", true]
});
export class ModbusProtocolError extends DataSourceError {
  public readonly exceptionCode: number;
  public readonly category: string;
  constructor(exceptionCode: number, message = "Modbus protocol exception.") {
    const [category, recoverable] = EXCEPTIONS[exceptionCode] ?? ["UNKNOWN_EXCEPTION", false];
    super("DATASOURCE_READ_ERROR", `${message} (${category}).`, {
      recoverable,
      context: { exceptionCode, category }
    });
    this.name = "ModbusProtocolError";
    this.exceptionCode = exceptionCode;
    this.category = category;
  }
}
