# Phase 9 repository inventory

| Package                           | Role                                                                                          | Public integration surface                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@web-scada/datasource-core`      | Contracts, normalization, lifecycle, reconnect, subscriptions, manager, diagnostics/redaction | `DataSourceAdapter`, normalized events/errors/quality, lifecycle controller, subscription manager, `createDataSourceManager` |
| `@web-scada/datasource-simulator` | Deterministic equipment-free source                                                           | `createSimulatorDataSource`, simulator control and generators                                                                |
| `@web-scada/datasource-rest`      | REST reads, writes, and polling                                                               | `createRestDataSourceAdapter`, injectable HTTP/auth transports                                                               |
| `@web-scada/datasource-websocket` | WebSocket streaming                                                                           | `createWebSocketDataSourceAdapter`, injectable socket transport                                                              |
| `@web-scada/datasource-mqtt`      | MQTT subscriptions and writes                                                                 | `createMqttDataSourceAdapter`, injectable MQTT client                                                                        |
| `@web-scada/datasource-modbus`    | Modbus addressing, codec, polling, reads/writes                                               | `createModbusDataSourceAdapter`, injectable client                                                                           |
| `@web-scada/datasource-opcua`     | OPC UA sessions and monitored items                                                           | `createOpcUaDataSourceAdapter`, local test utilities                                                                         |
| `@web-scada/runtime-engine`       | Protocol-neutral ingestion, store, visual snapshots                                           | `createDataSourceRuntimeIngestion`, `InMemoryTagStore`, runtime bridge                                                       |
| `@web-scada/binding-engine`       | Incremental binding evaluation                                                                | binding coordinator and Runtime-renderer integration                                                                         |
| `@web-scada/renderer-svg`         | Resolved-state SVG rendering                                                                  | renderer/DOM contracts; no datasource imports                                                                                |

All six adapters implement the shared `DataSourceAdapter` contract and use datasource-core status,
error, event, quality, scheduling, reconnect, and subscription abstractions.

Application composition registers concrete adapters with the manager. Runtime receives only
normalized events. Binding and Renderer have no concrete adapter imports. No Plugin Host package
or public registration surface exists, so Plugin Host integration is not applicable.

Credentials remain adapter-factory/auth-provider inputs and are not part of `ScadaDocument`,
manager descriptors, Runtime snapshots, or renderer state.
